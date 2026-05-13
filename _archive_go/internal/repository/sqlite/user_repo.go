package sqlite

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	"finance-tracker/internal/domain"
)

// UserRepository репозиторий для работы с пользователями
type UserRepository struct {
	db *sql.DB
}

// NewUserRepository создаёт новый репозиторий пользователей
func NewUserRepository(db *sql.DB) *UserRepository {
	return &UserRepository{db: db}
}

// GetByEmail получает пользователя по email
func (r *UserRepository) GetByEmail(ctx context.Context, email string) (*domain.User, error) {
	user := &domain.User{}
	var createdAt string
	var isActive, isAdmin int
	var lastLogin, lastActivity sql.NullString

	err := r.db.QueryRowContext(ctx, `
		SELECT id, email, password_hash, name, is_active, COALESCE(is_admin, 0), last_login_at, last_activity_at, created_at
		FROM users
		WHERE email = ? AND is_active = 1
	`, email).Scan(
		&user.ID,
		&user.Email,
		&user.PasswordHash,
		&user.Name,
		&isActive,
		&isAdmin,
		&lastLogin,
		&lastActivity,
		&createdAt,
	)

	if err != nil {
		if err == sql.ErrNoRows {
			return nil, fmt.Errorf("user not found")
		}
		return nil, err
	}

	user.IsActive = isActive == 1
	user.IsAdmin = isAdmin == 1
	if lastLogin.Valid {
		user.LastLoginAt = lastLogin.String
	}
	if lastActivity.Valid {
		user.LastActivityAt = lastActivity.String
	}
	user.CreatedAt, _ = time.Parse("2006-01-02 15:04:05", createdAt)

	return user, nil
}

// GetByID получает пользователя по ID
func (r *UserRepository) GetByID(ctx context.Context, id int64) (*domain.User, error) {
	user := &domain.User{}
	var createdAt string
	var isActive, isAdmin int
	var lastLogin, lastActivity sql.NullString

	err := r.db.QueryRowContext(ctx, `
		SELECT id, email, password_hash, name, is_active, COALESCE(is_admin, 0), last_login_at, last_activity_at, created_at
		FROM users
		WHERE id = ?
	`, id).Scan(
		&user.ID,
		&user.Email,
		&user.PasswordHash,
		&user.Name,
		&isActive,
		&isAdmin,
		&lastLogin,
		&lastActivity,
		&createdAt,
	)

	if err != nil {
		if err == sql.ErrNoRows {
			return nil, fmt.Errorf("user not found")
		}
		return nil, err
	}

	user.IsActive = isActive == 1
	user.IsAdmin = isAdmin == 1
	if lastLogin.Valid {
		user.LastLoginAt = lastLogin.String
	}
	if lastActivity.Valid {
		user.LastActivityAt = lastActivity.String
	}
	user.CreatedAt, _ = time.Parse("2006-01-02 15:04:05", createdAt)

	return user, nil
}

// Create создаёт нового пользователя
func (r *UserRepository) Create(ctx context.Context, user *domain.User) error {
	result, err := r.db.ExecContext(ctx, `
		INSERT INTO users (email, password_hash, name, is_active, is_admin, created_at)
		VALUES (?, ?, ?, 1, 0, CURRENT_TIMESTAMP)
	`, user.Email, user.PasswordHash, user.Name)

	if err != nil {
		return err
	}

	id, err := result.LastInsertId()
	if err != nil {
		return err
	}

	user.ID = id
	user.CreatedAt = time.Now()
	user.IsActive = true

	return nil
}

// List возвращает список всех пользователей
func (r *UserRepository) List(ctx context.Context) ([]domain.User, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT id, email, password_hash, name, is_active, COALESCE(is_admin, 0), last_login_at, last_activity_at, created_at
		FROM users
		ORDER BY created_at DESC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var users []domain.User
	for rows.Next() {
		var user domain.User
		var createdAt string
		var isActive, isAdmin int
		var lastLogin, lastActivity sql.NullString

		err := rows.Scan(
			&user.ID,
			&user.Email,
			&user.PasswordHash,
			&user.Name,
			&isActive,
			&isAdmin,
			&lastLogin,
			&lastActivity,
			&createdAt,
		)
		if err != nil {
			return nil, err
		}

		user.IsActive = isActive == 1
		user.IsAdmin = isAdmin == 1
		if lastLogin.Valid {
			user.LastLoginAt = lastLogin.String
		}
		if lastActivity.Valid {
			user.LastActivityAt = lastActivity.String
		}
		user.CreatedAt, _ = time.Parse("2006-01-02 15:04:05", createdAt)
		users = append(users, user)
	}

	return users, nil
}

// UpdateLastLogin обновляет время последнего входа
func (r *UserRepository) UpdateLastLogin(ctx context.Context, userID int64) error {
	_, err := r.db.ExecContext(ctx, `
		UPDATE users SET last_login_at = datetime('now') WHERE id = ?
	`, userID)
	return err
}

// Update обновляет данные пользователя (password обновляется только если PasswordHash не пустой)
func (r *UserRepository) Update(ctx context.Context, user *domain.User) error {
	isActive := 0
	if user.IsActive {
		isActive = 1
	}
	var result sql.Result
	var err error
	if user.PasswordHash != "" {
		result, err = r.db.ExecContext(ctx, `
			UPDATE users SET email = ?, name = ?, is_active = ?, password_hash = ?
			WHERE id = ?
		`, user.Email, user.Name, isActive, user.PasswordHash, user.ID)
	} else {
		result, err = r.db.ExecContext(ctx, `
			UPDATE users SET email = ?, name = ?, is_active = ?
			WHERE id = ?
		`, user.Email, user.Name, isActive, user.ID)
	}
	if err != nil {
		return err
	}
	rows, _ := result.RowsAffected()
	if rows == 0 {
		return fmt.Errorf("user not found")
	}
	return nil
}
