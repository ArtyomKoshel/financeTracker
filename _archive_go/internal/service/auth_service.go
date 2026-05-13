package service

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"time"

	"github.com/golang-jwt/jwt/v5"

	"finance-tracker/internal/domain"
	"finance-tracker/internal/repository"
)

// AuthService сервис авторизации
type AuthService struct {
	userRepo  repository.UserRepository
	jwtSecret string
}

// NewAuthService создаёт новый сервис авторизации
func NewAuthService(userRepo repository.UserRepository, jwtSecret string) *AuthService {
	return &AuthService{
		userRepo:  userRepo,
		jwtSecret: jwtSecret,
	}
}

// Login выполняет вход пользователя
func (s *AuthService) Login(ctx context.Context, req domain.LoginRequest) (*domain.LoginResponse, error) {
	user, err := s.userRepo.GetByEmail(ctx, req.Email)
	if err != nil {
		return nil, fmt.Errorf("invalid credentials")
	}

	if !s.verifyPassword(req.Password, user.PasswordHash) {
		return nil, fmt.Errorf("invalid credentials")
	}

	if err := s.userRepo.UpdateLastLogin(ctx, user.ID); err != nil {
		// Log but don't fail login
	}
	user.LastLoginAt = time.Now().Format("2006-01-02 15:04:05")

	token, err := s.generateToken(user.ID, user.IsAdmin)
	if err != nil {
		return nil, err
	}

	return &domain.LoginResponse{
		Token: token,
		User:  *user,
	}, nil
}

// generateToken генерирует JWT токен
func (s *AuthService) generateToken(userID int64, isAdmin bool) (string, error) {
	claims := jwt.MapClaims{
		"user_id":  userID,
		"is_admin": isAdmin,
		"exp":      time.Now().Add(24 * time.Hour).Unix(),
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(s.jwtSecret))
}

// VerifyToken проверяет JWT токен и возвращает user_id и is_admin
func (s *AuthService) VerifyToken(tokenString string) (userID int64, isAdmin bool, err error) {
	token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
		}
		return []byte(s.jwtSecret), nil
	})

	if err != nil {
		return 0, false, fmt.Errorf("invalid token: %w", err)
	}

	if !token.Valid {
		return 0, false, fmt.Errorf("invalid token")
	}

	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok {
		return 0, false, fmt.Errorf("invalid token claims")
	}

	userIDFloat, ok := claims["user_id"].(float64)
	if !ok {
		return 0, false, fmt.Errorf("user_id not found in token")
	}

	isAdmin = false
	if adm, ok := claims["is_admin"].(bool); ok {
		isAdmin = adm
	}

	return int64(userIDFloat), isAdmin, nil
}

// GenerateTokenForUser генерирует JWT для указанного пользователя (для impersonate)
func (s *AuthService) GenerateTokenForUser(userID int64, isAdmin bool) (string, error) {
	return s.generateToken(userID, isAdmin)
}

// HashPassword хеширует пароль
func (s *AuthService) HashPassword(password string) string {
	hash := sha256.Sum256([]byte(password))
	return hex.EncodeToString(hash[:])
}

// verifyPassword проверяет пароль
func (s *AuthService) verifyPassword(password, hash string) bool {
	return s.HashPassword(password) == hash
}
