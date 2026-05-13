package main

import (
	"context"
	"database/sql"
	"embed"
	"encoding/json"
	"flag"
	"fmt"
	"io/fs"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"finance-tracker/internal/handler"
	"finance-tracker/internal/repository/sqlite"
	"finance-tracker/internal/service"
	"finance-tracker/internal/websocket"

	_ "modernc.org/sqlite"
)

//go:embed templates/* static/* migrations/*.sql
var content embed.FS

func main() {
	port := flag.Int("port", 8080, "HTTP server port")
	dbPath := flag.String("db", "", "Database file path (default: ./data/finance.db)")
	flag.Parse()

	// Определяем путь к БД
	if *dbPath == "" {
		execPath, _ := os.Executable()
		dataDir := filepath.Join(filepath.Dir(execPath), "data")
		os.MkdirAll(dataDir, 0755)
		*dbPath = filepath.Join(dataDir, "finance.db")
	}

	// Также создаём папку data в текущей директории для dev режима
	os.MkdirAll("data", 0755)
	if _, err := os.Stat(*dbPath); os.IsNotExist(err) {
		*dbPath = "data/finance.db"
	}

	log.Printf("Using database: %s", *dbPath)

	// Запускаем миграции
	if err := runMigrations(*dbPath); err != nil {
		log.Fatalf("Failed to run migrations: %v", err)
	}

	// Инициализация БД
	db, err := sqlite.NewDB(*dbPath)
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}
	defer db.Close()

	// Инициализация данных по умолчанию
	if err := db.InitDefaults(); err != nil {
		log.Printf("Warning: failed to init defaults: %v", err)
	}
	if err := db.SeedCategories(); err != nil {
		log.Printf("Warning: failed to seed categories: %v", err)
	}

	// ========== DEPENDENCY INJECTION ==========

	// Repositories
	txRepo := sqlite.NewTransactionRepository(db)
	categoryRepo := sqlite.NewCategoryRepository(db)
	paymentRepo := sqlite.NewPaymentRepository(db)
	goalRepo := sqlite.NewGoalRepository(db)
	accountRepo := sqlite.NewAccountRepository(db)
	settingsRepo := sqlite.NewSettingsRepository(db)
	analyticsRepo := sqlite.NewAnalyticsRepository(db)
	categoryBudgetRepo := sqlite.NewCategoryBudgetRepository(db)
	userRepo := sqlite.NewUserRepository(db.DB)

	// Migrate settings to history
	settingsRepo.MigrateToHistory(context.Background())

	// JWT secret
	jwtSecret := os.Getenv("JWT_SECRET")
	if jwtSecret == "" {
		jwtSecret = "your-secret-key-change-in-production-please"
	}

	// Services
	currencySvc := service.NewCurrencyService(settingsRepo)
	authSvc := service.NewAuthService(userRepo, jwtSecret)
	txSvc := service.NewTransactionService(txRepo, paymentRepo, settingsRepo, currencySvc)
	budgetSvc := service.NewBudgetService(accountRepo, txRepo, paymentRepo, settingsRepo, goalRepo, categoryBudgetRepo, currencySvc)
	dashboardSvc := service.NewDashboardService(txRepo, goalRepo, settingsRepo, currencySvc)
	analyticsSvc := service.NewAnalyticsService(analyticsRepo)
	goalSvc := service.NewGoalService(goalRepo, txRepo, currencySvc)
	accountSvc := service.NewAccountService(accountRepo, txRepo)
	categoryBudgetSvc := service.NewCategoryBudgetService(categoryBudgetRepo, categoryRepo)
	healthSvc := service.NewHealthService(accountRepo, txRepo, paymentRepo, categoryBudgetRepo, analyticsRepo, goalRepo, currencySvc, budgetSvc)
	
	// Wire up category budget service to transaction service for budget warnings
	txSvc.SetCategoryBudgetService(categoryBudgetSvc)
	// Wire up goal service for auto-updating progress on savings transactions
	txSvc.SetGoalService(goalSvc)

	// WebSocket Hub
	hub := websocket.NewHub()
	go hub.Run()

	// Handlers
	baseHandler := handler.NewBaseHandler(hub)
	authHandler := handler.NewAuthHandler(baseHandler, authSvc)
	adminHandler := handler.NewAdminHandler(baseHandler, userRepo, txRepo, authSvc)
	txHandler := handler.NewTransactionHandler(baseHandler, txSvc)
	categoryHandler := handler.NewCategoryHandler(baseHandler, categoryRepo)
	paymentHandler := handler.NewPaymentHandler(baseHandler, paymentRepo, currencySvc)
	dashboardHandler := handler.NewDashboardHandler(baseHandler, dashboardSvc)
	analyticsHandler := handler.NewAnalyticsHandler(baseHandler, analyticsSvc)
	budgetHandler := handler.NewBudgetHandler(baseHandler, budgetSvc)
	settingsHandler := handler.NewSettingsHandler(baseHandler, settingsRepo, currencySvc)
	accountHandler := handler.NewAccountHandler(baseHandler, accountSvc)
	goalHandler := handler.NewGoalHandler(baseHandler, goalSvc)
	categoryBudgetHandler := handler.NewCategoryBudgetHandler(baseHandler, categoryBudgetSvc)
	healthHandler := handler.NewHealthHandler(baseHandler, healthSvc)

	// ========== BACKGROUND TASKS ==========

	// Автоматическое обновление курсов при старте
	go func() {
		ctx := context.Background()
		lastUpdate, _ := settingsRepo.Get(ctx, "rates_updated")
		shouldUpdate := true

		if lastUpdate != "" {
			if t, err := time.Parse("2006-01-02 15:04", lastUpdate); err == nil {
				if time.Since(t) < 12*time.Hour {
					shouldUpdate = false
				}
			}
		}

		if shouldUpdate {
			log.Println("Updating currency rates from NBRB...")
			rates, err := currencySvc.UpdateRatesFromNBRB(ctx)
			if err == nil && len(rates) > 0 {
				log.Printf("Rates updated: USD=%.4f, EUR=%.4f, RUB=%.6f", rates["USD"], rates["EUR"], rates["RUB"])
			} else {
				log.Println("Failed to update rates:", err)
			}
		}
	}()

	// ========== ROUTES ==========

	mux := http.NewServeMux()

	// Auth routes (no auth middleware)
	mux.HandleFunc("/api/auth/login", authHandler.Login)
	
	// Admin routes
	mux.HandleFunc("/api/admin/me", adminHandler.AdminMe)
	// /api/admin/clients/ — prefix match для /api/admin/clients/2, /api/admin/clients/2/impersonate
	mux.HandleFunc("/api/admin/clients/", func(w http.ResponseWriter, r *http.Request) {
		path := r.URL.Path
		switch r.Method {
		case http.MethodGet:
			adminHandler.GetClient(w, r)
		case http.MethodPut:
			adminHandler.UpdateClient(w, r)
		case http.MethodPost:
			if strings.HasSuffix(path, "/impersonate") {
				adminHandler.Impersonate(w, r)
			} else {
				http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			}
		default:
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		}
	})
	// /api/admin/clients — exact match для GET (list) и POST (create)
	mux.HandleFunc("/api/admin/clients", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodPost:
			adminHandler.CreateClient(w, r)
		case http.MethodGet:
			adminHandler.ListClients(w, r)
		default:
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		}
	})

	// Dashboard
	mux.HandleFunc("/api/dashboard", dashboardHandler.Get)
	mux.HandleFunc("/api/income-recommendation", budgetHandler.GetCashflow)

	// Transactions
	mux.HandleFunc("/api/transactions", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			txHandler.GetAll(w, r)
		case http.MethodPost:
			txHandler.Create(w, r)
		case http.MethodDelete:
			txHandler.Delete(w, r)
		default:
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		}
	})
	mux.HandleFunc("/api/transactions/month", txHandler.GetByMonth)
	mux.HandleFunc("/api/validate", txHandler.Validate)
	mux.HandleFunc("/api/month-summary", func(w http.ResponseWriter, r *http.Request) {
		month := r.URL.Query().Get("month")
		if month == "" {
			month = time.Now().Format("2006-01")
		}
		summary, err := txRepo.GetMonthSummary(r.Context(), month)
		baseHandler.JSONResponse(w, summary, err)
	})

	// Goals
	mux.HandleFunc("/api/goals", goalHandler.Create)

	// Settings
	mux.HandleFunc("/api/settings", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			settingsHandler.Get(w, r)
		case http.MethodPost:
			settingsHandler.Update(w, r)
		default:
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		}
	})

	// Payments
	mux.HandleFunc("/api/payments", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			paymentHandler.GetAll(w, r)
		case http.MethodPost:
			paymentHandler.Create(w, r)
		case http.MethodPut:
			paymentHandler.Update(w, r)
		case http.MethodDelete:
			paymentHandler.Delete(w, r)
		default:
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		}
	})
	mux.HandleFunc("/api/payments/reminders", paymentHandler.GetReminders)
	mux.HandleFunc("/api/budget-plan", budgetHandler.CalculatePlan)

	// Rates
	mux.HandleFunc("/api/rates", settingsHandler.GetRates)
	mux.HandleFunc("/api/rates/update", settingsHandler.UpdateRatesFromNBRB)

	// Balance
	mux.HandleFunc("/api/balance", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			accountHandler.GetBalance(w, r)
		case http.MethodPost:
			accountHandler.SetInitialBalance(w, r)
		default:
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		}
	})
	mux.HandleFunc("/api/balance/sync", accountHandler.SyncBalance)

	// Categories
	mux.HandleFunc("/api/categories", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			categoryHandler.GetAll(w, r)
		case http.MethodPost:
			categoryHandler.Create(w, r)
		default:
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		}
	})
	mux.HandleFunc("/api/categories/update", categoryHandler.Update)
	mux.HandleFunc("/api/categories/delete", categoryHandler.Delete)
	mux.HandleFunc("/api/categories/restore", categoryHandler.Restore)

	// Analytics
	mux.HandleFunc("/api/analytics", analyticsHandler.Get)
	mux.HandleFunc("/api/analytics/by-category", analyticsHandler.GetByCategory)
	mux.HandleFunc("/api/analytics/year", analyticsHandler.GetYearly)
	mux.HandleFunc("/api/analytics/compare", analyticsHandler.CompareMonths)
	mux.HandleFunc("/api/analytics/trends", analyticsHandler.GetCategoryTrend)
	mux.HandleFunc("/api/budget/monthly", budgetHandler.GetMonthly)

	// Financial Health (AI-ready metrics)
	mux.HandleFunc("/api/health", healthHandler.GetHealth)

	// Category Budgets
	mux.HandleFunc("/api/budgets", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			categoryBudgetHandler.GetByMonth(w, r)
		case http.MethodPost:
			categoryBudgetHandler.SetBudget(w, r)
		case http.MethodDelete:
			categoryBudgetHandler.DeleteBudget(w, r)
		default:
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		}
	})

	// WebSocket
	mux.HandleFunc("/ws", hub.ServeWs)

	// Internal: HTTP endpoint for Laravel to trigger WebSocket broadcasts (localhost only)
	mux.HandleFunc("/internal/broadcast", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}
		if host, _, _ := strings.Cut(r.RemoteAddr, ":"); host != "127.0.0.1" && host != "[::1]" && host != "localhost" {
			http.Error(w, "Forbidden", http.StatusForbidden)
			return
		}
		var req struct {
			Target string `json:"target"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Target == "" {
			http.Error(w, `{"success":false,"error":"target required"}`, http.StatusBadRequest)
			return
		}
		hub.BroadcastUpdate(req.Target)
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]bool{"success": true})
	})

	// Static files (embedded for go:embed or from disk for development)
	staticFS, _ := fs.Sub(content, "static")
	mux.Handle("/static/", http.StripPrefix("/static/", http.FileServer(http.FS(staticFS))))

	// Login page
	mux.HandleFunc("/login", func(w http.ResponseWriter, r *http.Request) {
		data, err := os.ReadFile("web/login.html")
		if err != nil {
			http.Error(w, "Login page not found", http.StatusNotFound)
			return
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Write(data)
	})

	// Admin page (built from static/dist or web/admin.html for dev)
	mux.HandleFunc("/admin", func(w http.ResponseWriter, r *http.Request) {
		data, err := content.ReadFile("static/dist/admin.html")
		if err != nil {
			data, err = os.ReadFile("web/admin.html")
		}
		if err != nil {
			http.Error(w, "Admin page not found", http.StatusNotFound)
			return
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Write(data)
	})

	// Main page - try built frontend first, fallback to template
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/" {
			http.NotFound(w, r)
			return
		}

		// Try to serve built frontend (production)
		data, err := content.ReadFile("static/dist/index.html")
		if err != nil {
			// Fallback to template (development)
			data, err = content.ReadFile("templates/index.html")
			if err != nil {
				http.Error(w, "Page not found", http.StatusNotFound)
				return
			}
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Write(data)
	})

	// Apply middleware
	finalHandler := handler.Chain(
		handler.RecoveryMiddleware,
		handler.LoggingMiddleware,
		handler.AuthMiddleware(authSvc),
		handler.AdminOnlyMiddleware,
	)(mux)

	addr := fmt.Sprintf(":%d", *port)
	log.Printf("🚀 Finance Tracker starting on http://localhost%s", addr)
	log.Printf("📱 For mobile access use: http://<your-ip>%s", addr)

	if err := http.ListenAndServe(addr, finalHandler); err != nil {
		log.Fatalf("Server error: %v", err)
	}
}

// ========== MIGRATOR ==========

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
		return applied, nil
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

	entries, err := fs.ReadDir(content, "migrations")
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

	sort.Strings(pending)

	return pending, nil
}

// Run применяет все ожидающие миграции
func (m *Migrator) Run() error {
	if err := m.Init(); err != nil {
		return fmt.Errorf("failed to init migrations table: %w", err)
	}

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
	data, err := fs.ReadFile(content, "migrations/"+filename)
	if err != nil {
		return err
	}

	upSQL := extractUpMigration(string(data))
	version := strings.TrimSuffix(filename, ".sql")

	log.Printf("  → Applying migration: %s", version)

	tx, err := m.db.Begin()
	if err != nil {
		return err
	}

	statements := splitStatements(upSQL)

	for _, stmt := range statements {
		stmt = strings.TrimSpace(stmt)
		if stmt == "" || strings.HasPrefix(stmt, "--") {
			continue
		}

		if _, err := tx.Exec(stmt); err != nil {
			tx.Rollback()
			if strings.Contains(stmt, "ALTER TABLE") && strings.Contains(err.Error(), "duplicate column") {
				log.Printf("    ⚠ Column already exists, skipping")
				continue
			}
			return fmt.Errorf("failed to execute statement: %w\nSQL: %s", err, stmt)
		}
	}

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
	var count int
	err := m.db.QueryRow(`SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='transactions'`).Scan(&count)
	if err != nil {
		return nil
	}

	if count > 0 {
		applied, _ := m.GetAppliedMigrations()
		if !applied["001_initial_schema"] {
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
	upStart := strings.Index(content, "-- +migrate Up")
	downStart := strings.Index(content, "-- +migrate Down")

	if upStart == -1 {
		return content
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

		if trimmed == "" || strings.HasPrefix(trimmed, "--") {
			continue
		}

		current.WriteString(line)
		current.WriteString("\n")

		if strings.HasSuffix(trimmed, ";") {
			statements = append(statements, current.String())
			current.Reset()
		}
	}

	if current.Len() > 0 {
		statements = append(statements, current.String())
	}

	return statements
}

// runMigrations запускает миграции базы данных
func runMigrations(dbPath string) error {
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		return fmt.Errorf("failed to open database: %w", err)
	}
	defer db.Close()

	migrator := NewMigrator(db)
	return migrator.Run()
}
