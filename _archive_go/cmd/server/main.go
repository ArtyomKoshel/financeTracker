package main

import (
	"context"
	"database/sql"
	"embed"
	"flag"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"time"

	"finance-tracker/internal/handler"
	"finance-tracker/internal/repository/sqlite"
	"finance-tracker/internal/service"
	"finance-tracker/internal/websocket"

	_ "modernc.org/sqlite"
)

//go:embed templates/* static/*
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

	// Migrate settings to history
	settingsRepo.MigrateToHistory(context.Background())

	// Services
	currencySvc := service.NewCurrencyService(settingsRepo)
	txSvc := service.NewTransactionService(txRepo, paymentRepo, settingsRepo, currencySvc)
	budgetSvc := service.NewBudgetService(accountRepo, txRepo, paymentRepo, settingsRepo, goalRepo, currencySvc)
	dashboardSvc := service.NewDashboardService(txRepo, goalRepo, settingsRepo, currencySvc)
	analyticsSvc := service.NewAnalyticsService(analyticsRepo)
	goalSvc := service.NewGoalService(goalRepo, txRepo, currencySvc)
	accountSvc := service.NewAccountService(accountRepo, txRepo)
	categoryBudgetSvc := service.NewCategoryBudgetService(categoryBudgetRepo, categoryRepo)
	
	// Wire up category budget service to transaction service for budget warnings
	txSvc.SetCategoryBudgetService(categoryBudgetSvc)

	// WebSocket Hub
	hub := websocket.NewHub()
	go hub.Run()

	// Handlers
	baseHandler := handler.NewBaseHandler(hub)
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

	// Static files - serve from filesystem for development
	// Check if running from project root or cmd/server
	staticDir := "static"
	if _, err := os.Stat(staticDir); os.IsNotExist(err) {
		staticDir = "../../static"
	}
	mux.Handle("/static/", http.StripPrefix("/static/", http.FileServer(http.Dir(staticDir))))

	// Main page
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/" {
			http.NotFound(w, r)
			return
		}
		data, err := content.ReadFile("templates/index.html")
		if err != nil {
			http.Error(w, "Page not found", http.StatusNotFound)
			return
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Write(data)
	})

	// Apply middleware
	finalHandler := handler.Chain(
		handler.RecoveryMiddleware,
		handler.LoggingMiddleware,
	)(mux)

	addr := fmt.Sprintf(":%d", *port)
	log.Printf("🚀 Finance Tracker starting on http://localhost%s", addr)
	log.Printf("📱 For mobile access use: http://<your-ip>%s", addr)

	if err := http.ListenAndServe(addr, finalHandler); err != nil {
		log.Fatalf("Server error: %v", err)
	}
}

// runMigrations запускает миграции базы данных
func runMigrations(dbPath string) error {
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		return fmt.Errorf("failed to open database: %w", err)
	}
	defer db.Close()

	// Используем локальный мигратор
	migrator := NewMigrator(db)
	return migrator.Run()
}
