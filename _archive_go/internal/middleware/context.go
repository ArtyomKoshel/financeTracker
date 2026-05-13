package middleware

import "context"

type contextKey string

const (
	clientIDKey contextKey = "client_id"
	isAdminKey  contextKey = "is_admin"
)

// WithClientID добавляет client_id в контекст
func WithClientID(ctx context.Context, clientID int64) context.Context {
	return context.WithValue(ctx, clientIDKey, clientID)
}

// GetClientIDFromContext извлекает client_id из контекста
func GetClientIDFromContext(ctx context.Context) int64 {
	if clientID, ok := ctx.Value(clientIDKey).(int64); ok {
		return clientID
	}
	return 0
}

// WithIsAdmin добавляет is_admin в контекст
func WithIsAdmin(ctx context.Context, isAdmin bool) context.Context {
	return context.WithValue(ctx, isAdminKey, isAdmin)
}

// GetIsAdminFromContext извлекает is_admin из контекста
func GetIsAdminFromContext(ctx context.Context) bool {
	if v, ok := ctx.Value(isAdminKey).(bool); ok {
		return v
	}
	return false
}
