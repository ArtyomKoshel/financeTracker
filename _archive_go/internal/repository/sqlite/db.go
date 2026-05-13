package sqlite

import (
	"database/sql"
	"fmt"

	_ "modernc.org/sqlite"
)

// DB обёртка над sql.DB с общими методами
type DB struct {
	*sql.DB
}

// NewDB создаёт новое подключение к SQLite
func NewDB(dbPath string) (*DB, error) {
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		return nil, fmt.Errorf("failed to open database: %w", err)
	}

	// Проверяем подключение
	if err := db.Ping(); err != nil {
		return nil, fmt.Errorf("failed to ping database: %w", err)
	}

	return &DB{db}, nil
}

// InitDefaults инициализирует значения по умолчанию
func (db *DB) InitDefaults() error {
	defaults := map[string]string{
		"gross_salary":      "320000",
		"expected_advance":  "160650",
		"ndfl_rate":         "0.15",
		"tolerance":         "3",
		"base_currency":     "BYN",
		"rub_rate":          "0.034",
		"eur_rate":          "3.55",
		"usd_rate":          "3.25",
		"advance_day":       "30",
		"salary_day":        "15",
		"min_living_budget": "1500",
		"savings_percent":   "20",
	}

	for k, v := range defaults {
		_, err := db.Exec(`INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)`, k, v)
		if err != nil {
			return fmt.Errorf("failed to set default %s: %w", k, err)
		}
	}

	// Создать основной счёт если не существует
	var accountCount int
	if err := db.QueryRow(`SELECT COUNT(*) FROM accounts`).Scan(&accountCount); err != nil {
		return fmt.Errorf("failed to count accounts: %w", err)
	}

	if accountCount == 0 {
		_, err := db.Exec(`INSERT INTO accounts (name, balance) VALUES ('Основной счёт', 0)`)
		if err != nil {
			return fmt.Errorf("failed to create main account: %w", err)
		}
	}

	return nil
}

// SeedCategories создаёт предустановленные категории
func (db *DB) SeedCategories() error {
	var catCount int
	if err := db.QueryRow(`SELECT COUNT(*) FROM categories`).Scan(&catCount); err != nil {
		return fmt.Errorf("failed to count categories: %w", err)
	}

	if catCount > 0 {
		return nil // Категории уже есть
	}

	type subcat struct {
		name string
		icon string
	}

	type cat struct {
		name  string
		icon  string
		color string
		subs  []subcat
	}

	categories := []cat{
		{"Еда", "🍕", "#FF6B6B", []subcat{
			{"Продукты", "🛒"},
			{"Кафе и рестораны", "🍽️"},
			{"Доставка еды", "🛵"},
		}},
		{"Жильё", "🏠", "#4ECDC4", []subcat{
			{"Аренда", "🔑"},
			{"Коммуналка", "💡"},
			{"Ремонт", "🔧"},
		}},
		{"Транспорт", "🚗", "#45B7D1", []subcat{
			{"Такси", "🚕"},
			{"Топливо", "⛽"},
			{"Общественный", "🚌"},
		}},
		{"Связь", "📱", "#96CEB4", []subcat{
			{"Телефон", "📞"},
			{"Интернет", "🌐"},
		}},
		{"Здоровье", "💊", "#FFEAA7", []subcat{
			{"Аптека", "💉"},
			{"Врачи", "👨‍⚕️"},
			{"Спорт", "🏃"},
		}},
		{"Развлечения", "🎮", "#DDA0DD", []subcat{
			{"Кино", "🎬"},
			{"Игры", "🕹️"},
			{"Подписки", "📺"},
		}},
		{"Одежда", "👕", "#FFB347", nil},
		{"Образование", "📚", "#87CEEB", nil},
		{"Подарки", "🎁", "#FFB6C1", nil},
		{"Другое", "📦", "#C0C0C0", nil},
	}

	for i, c := range categories {
		result, err := db.Exec(
			`INSERT INTO categories (name, icon, color, sort_order) VALUES (?, ?, ?, ?)`,
			c.name, c.icon, c.color, i*10,
		)
		if err != nil {
			continue
		}

		parentID, _ := result.LastInsertId()
		for j, sub := range c.subs {
			_, _ = db.Exec(
				`INSERT INTO categories (name, parent_id, icon, color, sort_order) VALUES (?, ?, ?, ?, ?)`,
				sub.name, parentID, sub.icon, c.color, i*10+j+1,
			)
		}
	}

	return nil
}
