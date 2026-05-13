package handler

import (
	"log"
	"net/http"
	"strings"
	"time"

	"finance-tracker/internal/middleware"
	"finance-tracker/internal/service"
)

// LoggingMiddleware логирует HTTP запросы
func LoggingMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		next.ServeHTTP(w, r)
		log.Printf("%s %s %v", r.Method, r.URL.Path, time.Since(start))
	})
}

// CORSMiddleware добавляет CORS заголовки
func CORSMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")

		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}

		next.ServeHTTP(w, r)
	})
}

// RecoveryMiddleware восстанавливается после паники
func RecoveryMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if err := recover(); err != nil {
				log.Printf("panic recovered: %v", err)
				http.Error(w, "Internal Server Error", http.StatusInternalServerError)
			}
		}()
		next.ServeHTTP(w, r)
	})
}

// AuthMiddleware проверяет JWT токен и добавляет client_id в контекст
func AuthMiddleware(authService *service.AuthService) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			// Skip auth for login endpoint, admin page, static files, WebSocket
			if r.URL.Path == "/api/auth/login" || strings.HasPrefix(r.URL.Path, "/static/") ||
				r.URL.Path == "/login" || r.URL.Path == "/login.html" || r.URL.Path == "/admin" || r.URL.Path == "/admin.html" ||
				r.URL.Path == "/ws" {
				next.ServeHTTP(w, r)
				return
			}

			authHeader := r.Header.Get("Authorization")
			if authHeader == "" {
				http.Error(w, `{"success":false,"error":"Unauthorized"}`, http.StatusUnauthorized)
				return
			}

			// Bearer <token>
			token := strings.TrimPrefix(authHeader, "Bearer ")
			clientID, isAdmin, err := authService.VerifyToken(token)
			if err != nil {
				http.Error(w, `{"success":false,"error":"Invalid token"}`, http.StatusUnauthorized)
				return
			}

			// Добавляем client_id и is_admin в контекст
			ctx := middleware.WithClientID(r.Context(), clientID)
			ctx = middleware.WithIsAdmin(ctx, isAdmin)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// AdminOnlyMiddleware проверяет, что пользователь — админ (только для /api/admin/*)
func AdminOnlyMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, "/api/admin/") && !middleware.GetIsAdminFromContext(r.Context()) {
			http.Error(w, `{"success":false,"error":"Forbidden: admin access required"}`, http.StatusForbidden)
			return
		}
		next.ServeHTTP(w, r)
	})
}

// Chain объединяет несколько middleware
func Chain(middlewares ...func(http.Handler) http.Handler) func(http.Handler) http.Handler {
	return func(final http.Handler) http.Handler {
		for i := len(middlewares) - 1; i >= 0; i-- {
			final = middlewares[i](final)
		}
		return final
	}
}
