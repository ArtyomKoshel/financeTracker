package sqlite

import (
	"context"
	"database/sql"
	"fmt"

	"finance-tracker/internal/domain"
)

// CategoryRepository реализация репозитория категорий для SQLite
type CategoryRepository struct {
	db *DB
}

// NewCategoryRepository создаёт новый репозиторий категорий
func NewCategoryRepository(db *DB) *CategoryRepository {
	return &CategoryRepository{db: db}
}

// GetAll получает все категории с подкатегориями
func (r *CategoryRepository) GetAll(ctx context.Context, includeInactive bool) ([]domain.CategoryWithSubs, error) {
	query := `SELECT id, name, parent_id, icon, color, sort_order, COALESCE(is_active, 1) 
		 FROM categories`
	if !includeInactive {
		query += ` WHERE is_active = 1 OR is_active IS NULL`
	}
	query += ` ORDER BY parent_id NULLS FIRST, sort_order`

	rows, err := r.db.QueryContext(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("query categories: %w", err)
	}
	defer rows.Close()

	// Map для быстрого доступа к родительским категориям по индексу
	parentIndexMap := make(map[int64]int)
	var result []domain.CategoryWithSubs
	var subcategories []domain.Category

	for rows.Next() {
		var id int64
		var name string
		var parentID *int64
		var icon, color *string
		var sortOrder int
		var isActive int

		err := rows.Scan(&id, &name, &parentID, &icon, &color, &sortOrder, &isActive)
		if err != nil {
			return nil, fmt.Errorf("scan category: %w", err)
		}

		if parentID == nil {
			c := domain.CategoryWithSubs{
				Category: domain.Category{
					ID:        id,
					Name:      name,
					SortOrder: sortOrder,
					IsActive:  isActive == 1,
				},
			}
			if icon != nil {
				c.Category.Icon = *icon
			}
			if color != nil {
				c.Category.Color = *color
			}
			parentIndexMap[id] = len(result)
			result = append(result, c)
		} else {
			sub := domain.Category{
				ID:        id,
				Name:      name,
				ParentID:  parentID,
				SortOrder: sortOrder,
				IsActive:  isActive == 1,
			}
			if icon != nil {
				sub.Icon = *icon
			}
			if color != nil {
				sub.Color = *color
			}
			subcategories = append(subcategories, sub)
		}
	}

	// Привязываем подкатегории к родителям
	for _, sub := range subcategories {
		if idx, ok := parentIndexMap[*sub.ParentID]; ok {
			result[idx].Subcategories = append(result[idx].Subcategories, sub)
		}
	}

	return result, nil
}

// GetByID получает категорию по ID
func (r *CategoryRepository) GetByID(ctx context.Context, id int64) (*domain.Category, error) {
	var c domain.Category
	var parentID *int64
	var icon, color *string
	var isActive int

	err := r.db.QueryRowContext(ctx,
		`SELECT id, name, parent_id, icon, color, sort_order, COALESCE(is_active, 1) 
		 FROM categories WHERE id = ?`, id,
	).Scan(&c.ID, &c.Name, &parentID, &icon, &color, &c.SortOrder, &isActive)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, fmt.Errorf("query category: %w", err)
	}

	c.ParentID = parentID
	c.IsActive = isActive == 1
	if icon != nil {
		c.Icon = *icon
	}
	if color != nil {
		c.Color = *color
	}

	return &c, nil
}

// Create создаёт новую категорию
func (r *CategoryRepository) Create(ctx context.Context, c *domain.Category) error {
	result, err := r.db.ExecContext(ctx,
		`INSERT INTO categories (name, parent_id, icon, color, sort_order, is_active) 
		 VALUES (?, ?, ?, ?, ?, 1)`,
		c.Name, c.ParentID, c.Icon, c.Color, c.SortOrder,
	)
	if err != nil {
		return fmt.Errorf("insert category: %w", err)
	}

	id, err := result.LastInsertId()
	if err != nil {
		return fmt.Errorf("get last insert id: %w", err)
	}

	c.ID = id
	c.IsActive = true
	return nil
}

// Update обновляет категорию
func (r *CategoryRepository) Update(ctx context.Context, c *domain.Category) error {
	_, err := r.db.ExecContext(ctx,
		`UPDATE categories SET name = ?, icon = ?, color = ?, sort_order = ? WHERE id = ?`,
		c.Name, c.Icon, c.Color, c.SortOrder, c.ID,
	)
	if err != nil {
		return fmt.Errorf("update category: %w", err)
	}
	return nil
}

// Delete деактивирует категорию (soft delete)
func (r *CategoryRepository) Delete(ctx context.Context, id int64) error {
	_, err := r.db.ExecContext(ctx,
		`UPDATE categories SET is_active = 0 WHERE id = ? OR parent_id = ?`, id, id)
	if err != nil {
		return fmt.Errorf("delete category: %w", err)
	}
	return nil
}

// Restore восстанавливает категорию
func (r *CategoryRepository) Restore(ctx context.Context, id int64) error {
	_, err := r.db.ExecContext(ctx, `UPDATE categories SET is_active = 1 WHERE id = ?`, id)
	if err != nil {
		return fmt.Errorf("restore category: %w", err)
	}
	return nil
}

// GetExpensesByCategory получает расходы по категориям за месяц
func (r *CategoryRepository) GetExpensesByCategory(ctx context.Context, month string) ([]domain.ExpenseByCategory, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT 
			COALESCE(c.id, 0) as cat_id,
			COALESCE(c.name, 'Без категории') as cat_name,
			COALESCE(c.icon, '📦') as icon,
			COALESCE(c.color, '#808080') as color,
			SUM(ABS(t.amount)) as total
		FROM transactions t
		LEFT JOIN categories c ON t.category_id = c.id
		WHERE t.type = 'expense' AND t.month = ?
		GROUP BY COALESCE(c.id, 0)
		ORDER BY total DESC
	`, month)
	if err != nil {
		return nil, fmt.Errorf("query expenses by category: %w", err)
	}
	defer rows.Close()

	var result []domain.ExpenseByCategory
	var totalAll float64

	for rows.Next() {
		var e domain.ExpenseByCategory
		err := rows.Scan(&e.CategoryID, &e.CategoryName, &e.Icon, &e.Color, &e.Amount)
		if err != nil {
			return nil, fmt.Errorf("scan expense: %w", err)
		}
		totalAll += e.Amount
		result = append(result, e)
	}

	// Рассчитать проценты
	for i := range result {
		if totalAll > 0 {
			result[i].Percent = (result[i].Amount / totalAll) * 100
		}
	}

	return result, nil
}

// IsUsed проверяет, используется ли категория в транзакциях
func (r *CategoryRepository) IsUsed(ctx context.Context, id int64) (bool, error) {
	var count int
	err := r.db.QueryRowContext(ctx,
		`SELECT COUNT(*) FROM transactions WHERE category_id = ?`, id,
	).Scan(&count)
	if err != nil {
		return false, fmt.Errorf("check category usage: %w", err)
	}
	return count > 0, nil
}

// ValidateParentID проверяет, не создаст ли изменение parent_id циклическую ссылку
func (r *CategoryRepository) ValidateParentID(ctx context.Context, categoryID int64, newParentID *int64) error {
	// Если parent_id = nil — это корневая категория, цикла быть не может
	if newParentID == nil {
		return nil
	}

	// Проверка на самоссылку
	if *newParentID == categoryID {
		return fmt.Errorf("категория не может быть родителем самой себя")
	}

	// Проверка, что новый родитель не является потомком текущей категории
	// (что создало бы цикл)
	currentID := *newParentID
	visited := make(map[int64]bool)
	visited[categoryID] = true

	for {
		var parentID *int64
		err := r.db.QueryRowContext(ctx,
			`SELECT parent_id FROM categories WHERE id = ?`, currentID,
		).Scan(&parentID)
		if err == sql.ErrNoRows {
			break // Категория не найдена
		}
		if err != nil {
			return fmt.Errorf("проверка цикла: %w", err)
		}

		if parentID == nil {
			break // Достигли корня
		}

		if visited[*parentID] {
			return fmt.Errorf("обнаружена циклическая ссылка категорий")
		}
		visited[currentID] = true
		currentID = *parentID
	}

	return nil
}
