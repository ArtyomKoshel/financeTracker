package main

import (
	"database/sql"
	"embed"
	"fmt"
	"io/fs"
	"log"
	"sort"
	"strings"
	"time"
)

//go:embed migrations/*.sql
var migrationsFS embed.FS

// Migrator управляет миграциями базы данных
type Migrator struct {
	db *sql.DB
}

// NewMigrator создаёт новый экземпляр мигратора
func NewMigrator(db *sql.DB) *Migrator {
	return &Migrator{db: db}
}

// Init инициализирует таблицу миграций
func (m *Migrator) Init() error {
	_, err := m.db.Exec(`
		CREATE TABLE IF NOT EXISTS schema_migrations (
			version TEXT PRIMARY KEY,
			applied_at TEXT NOT NULL
		)
	`)
	return err
}

// GetAppliedMigrations возвращает список применённых миграций
func (m *Migrator) GetAppliedMigrations() (map[string]bool, error) {
	applied := make(map[string]bool)
	
	rows, err := m.db.Query(`SELECT version FROM schema_migrations`)
	if err != nil {
		return applied, nil // Таблица ещё не существует
	}
	defer rows.Close()
	
	for rows.Next() {
		var version string
		if err := rows.Scan(&version); err != nil {
			return nil, err
		}
		applied[version] = true
	}
	
	return applied, nil
}

// GetPendingMigrations возвращает список миграций, которые нужно применить
func (m *Migrator) GetPendingMigrations() ([]string, error) {
	applied, err := m.GetAppliedMigrations()
	if err != nil {
		return nil, err
	}
	
	// Читаем файлы миграций
	entries, err := fs.ReadDir(migrationsFS, "migrations")
	if err != nil {
		return nil, fmt.Errorf("failed to read migrations: %w", err)
	}
	
	var pending []string
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".sql") {
			continue
		}
		
		version := strings.TrimSuffix(entry.Name(), ".sql")
		if !applied[version] {
			pending = append(pending, entry.Name())
		}
	}
	
	// Сортируем по имени (001_, 002_, ...)
	sort.Strings(pending)
	
	return pending, nil
}

// Run применяет все ожидающие миграции
func (m *Migrator) Run() error {
	if err := m.Init(); err != nil {
		return fmt.Errorf("failed to init migrations table: %w", err)
	}
	
	// Проверяем, существует ли уже база данных с данными
	// Если да, отмечаем первую миграцию как выполненную
	if err := m.markExistingDatabaseMigrated(); err != nil {
		return err
	}
	
	pending, err := m.GetPendingMigrations()
	if err != nil {
		return err
	}
	
	if len(pending) == 0 {
		log.Println("✓ No pending migrations")
		return nil
	}
	
	log.Printf("→ Found %d pending migrations", len(pending))
	
	for _, filename := range pending {
		if err := m.applyMigration(filename); err != nil {
			return fmt.Errorf("migration %s failed: %w", filename, err)
		}
	}
	
	return nil
}

// applyMigration применяет одну миграцию
func (m *Migrator) applyMigration(filename string) error {
	content, err := fs.ReadFile(migrationsFS, "migrations/"+filename)
	if err != nil {
		return err
	}
	
	// Извлекаем только Up часть миграции
	upSQL := extractUpMigration(string(content))
	
	version := strings.TrimSuffix(filename, ".sql")
	
	log.Printf("  → Applying migration: %s", version)
	
	// Выполняем миграцию в транзакции
	tx, err := m.db.Begin()
	if err != nil {
		return err
	}
	
	// Разбиваем на отдельные statements
	statements := splitStatements(upSQL)
	
	for _, stmt := range statements {
		stmt = strings.TrimSpace(stmt)
		if stmt == "" || strings.HasPrefix(stmt, "--") {
			continue
		}
		
		if _, err := tx.Exec(stmt); err != nil {
			tx.Rollback()
			// Игнорируем ошибки "column already exists" для ALTER TABLE
			if strings.Contains(stmt, "ALTER TABLE") && strings.Contains(err.Error(), "duplicate column") {
				log.Printf("    ⚠ Column already exists, skipping")
				continue
			}
			return fmt.Errorf("failed to execute statement: %w\nSQL: %s", err, stmt)
		}
	}
	
	// Записываем версию миграции
	_, err = tx.Exec(
		`INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)`,
		version,
		time.Now().Format(time.RFC3339),
	)
	if err != nil {
		tx.Rollback()
		return err
	}
	
	if err := tx.Commit(); err != nil {
		return err
	}
	
	log.Printf("  ✓ Migration %s applied", version)
	return nil
}

// markExistingDatabaseMigrated проверяет существующую БД и отмечает первую миграцию
func (m *Migrator) markExistingDatabaseMigrated() error {
	// Проверяем, есть ли уже таблица transactions
	var count int
	err := m.db.QueryRow(`SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='transactions'`).Scan(&count)
	if err != nil {
		return nil // Нет таблиц, БД новая
	}
	
	if count > 0 {
		// БД уже существует, проверяем применена ли первая миграция
		applied, _ := m.GetAppliedMigrations()
		if !applied["001_initial_schema"] {
			// Отмечаем первую миграцию как выполненную
			_, err := m.db.Exec(
				`INSERT OR IGNORE INTO schema_migrations (version, applied_at) VALUES (?, ?)`,
				"001_initial_schema",
				time.Now().Format(time.RFC3339),
			)
			if err != nil {
				return err
			}
			log.Println("  → Existing database detected, marked initial migration as applied")
		}
	}
	
	return nil
}

// extractUpMigration извлекает SQL для применения миграции
func extractUpMigration(content string) string {
	// Ищем секцию между "-- +migrate Up" и "-- +migrate Down"
	upStart := strings.Index(content, "-- +migrate Up")
	downStart := strings.Index(content, "-- +migrate Down")
	
	if upStart == -1 {
		return content // Нет маркеров, возвращаем всё
	}
	
	upStart += len("-- +migrate Up")
	
	if downStart == -1 {
		return content[upStart:]
	}
	
	return content[upStart:downStart]
}

// splitStatements разбивает SQL на отдельные statements
func splitStatements(sql string) []string {
	var statements []string
	var current strings.Builder
	
	lines := strings.Split(sql, "\n")
	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		
		// Пропускаем пустые строки и комментарии
		if trimmed == "" || strings.HasPrefix(trimmed, "--") {
			continue
		}
		
		current.WriteString(line)
		current.WriteString("\n")
		
		// Если строка заканчивается на ;, это конец statement
		if strings.HasSuffix(trimmed, ";") {
			statements = append(statements, current.String())
			current.Reset()
		}
	}
	
	// Добавляем последний statement если есть
	if current.Len() > 0 {
		statements = append(statements, current.String())
	}
	
	return statements
}
