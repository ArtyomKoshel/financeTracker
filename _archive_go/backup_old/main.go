package main

import (
	"database/sql"
	"embed"
	"flag"
	"fmt"
	"io/fs"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"time"

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

	// Инициализация хранилища
	storage, err := NewStorage(*dbPath)
	if err != nil {
		log.Fatalf("Failed to initialize storage: %v", err)
	}
	defer storage.Close()

	// WebSocket Hub
	hub := NewHub()
	go hub.Run()

	handlers := NewHandlers(storage, hub)

	// Автоматическое обновление курсов при старте (в фоне)
	go func() {
		// Проверяем, нужно ли обновить курсы
		lastUpdate, _ := storage.GetSetting("rates_updated")
		shouldUpdate := true

		if lastUpdate != "" {
			if t, err := time.Parse("2006-01-02 15:04", lastUpdate); err == nil {
				// Обновляем если прошло больше 12 часов
				if time.Since(t) < 12*time.Hour {
					shouldUpdate = false
				}
			}
		}

		if shouldUpdate {
			log.Println("Updating currency rates from NBRB...")
			rates, err := handlers.FetchNBRBRates()
			if err == nil && len(rates) > 0 {
				if usd, ok := rates["USD"]; ok {
					storage.SetSetting("usd_rate", fmt.Sprintf("%.4f", usd))
				}
				if eur, ok := rates["EUR"]; ok {
					storage.SetSetting("eur_rate", fmt.Sprintf("%.4f", eur))
				}
				if rub, ok := rates["RUB"]; ok {
					storage.SetSetting("rub_rate", fmt.Sprintf("%.6f", rub))
				}
				storage.SetSetting("rates_updated", time.Now().Format("2006-01-02 15:04"))
				log.Printf("Rates updated: USD=%.4f, EUR=%.4f, RUB=%.6f", rates["USD"], rates["EUR"], rates["RUB"])
			} else {
				log.Println("Failed to update rates:", err)
			}
		}
	}()

	// API routes
	http.HandleFunc("/api/dashboard", handlers.GetDashboard)
	http.HandleFunc("/api/income-recommendation", handlers.GetIncomeRecommendation)
	http.HandleFunc("/api/transactions", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			handlers.GetTransactions(w, r)
		case http.MethodPost:
			handlers.AddTransaction(w, r)
		case http.MethodDelete:
			handlers.DeleteTransaction(w, r)
		default:
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		}
	})
	http.HandleFunc("/api/validate", handlers.ValidatePayment)
	http.HandleFunc("/api/goals", handlers.CreateGoal)
	http.HandleFunc("/api/settings", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			handlers.GetSettings(w, r)
		case http.MethodPost:
			handlers.UpdateSettings(w, r)
		default:
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		}
	})
	http.HandleFunc("/api/month-summary", handlers.GetMonthSummary)

	// Recurring Payments API
	http.HandleFunc("/api/payments", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			handlers.GetRecurringPayments(w, r)
		case http.MethodPost:
			handlers.AddRecurringPayment(w, r)
		case http.MethodDelete:
			handlers.DeleteRecurringPayment(w, r)
		default:
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		}
	})
	http.HandleFunc("/api/payments/mark-paid", handlers.MarkPaymentPaid)
	http.HandleFunc("/api/payments/reminders", handlers.GetPaymentReminders)
	http.HandleFunc("/api/budget-plan", handlers.CalculateBudgetPlan)

	// Currency rates
	http.HandleFunc("/api/rates", handlers.GetCurrentRates)
	http.HandleFunc("/api/rates/update", handlers.UpdateRatesFromNBRB)

	// Balance / Account
	http.HandleFunc("/api/balance", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			handlers.GetBalance(w, r)
		case http.MethodPost:
			handlers.SetInitialBalance(w, r)
		default:
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		}
	})
	http.HandleFunc("/api/balance/sync", handlers.SyncBalance)

	// Categories
	http.HandleFunc("/api/categories", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			handlers.GetCategoriesHandler(w, r)
		case http.MethodPost:
			handlers.AddCategoryHandler(w, r)
		default:
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		}
	})
	http.HandleFunc("/api/categories/flat", handlers.GetCategoriesFlat)
	http.HandleFunc("/api/categories/update", handlers.UpdateCategoryHandler)
	http.HandleFunc("/api/categories/delete", handlers.DeleteCategoryHandler)
	http.HandleFunc("/api/categories/restore", handlers.RestoreCategoryHandler)

	// Analytics
	http.HandleFunc("/api/analytics", handlers.GetAnalytics)
	http.HandleFunc("/api/analytics/by-category", handlers.GetExpensesByCategory)
	http.HandleFunc("/api/budget/monthly", handlers.GetMonthlyBudget)
	http.HandleFunc("/api/transactions/month", handlers.GetTransactionsByMonth)

	// WebSocket
	http.HandleFunc("/ws", hub.ServeWs)

	// Static files и templates
	staticFS, _ := fs.Sub(content, "static")
	http.Handle("/static/", http.StripPrefix("/static/", http.FileServer(http.FS(staticFS))))

	// Главная страница
	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
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

	addr := fmt.Sprintf(":%d", *port)
	log.Printf("🚀 Finance Tracker starting on http://localhost%s", addr)
	log.Printf("📱 For mobile access use: http://<your-ip>%s", addr)

	if err := http.ListenAndServe(addr, nil); err != nil {
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

	migrator := NewMigrator(db)
	return migrator.Run()
}
