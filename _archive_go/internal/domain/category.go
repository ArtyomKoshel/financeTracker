package domain

// Category категория расходов
type Category struct {
	ID        int64  `json:"id"`
	ClientID  int64  `json:"client_id"`  // ID клиента (мультитенантность)
	Name      string `json:"name"`       // "Еда", "Транспорт"
	ParentID  *int64 `json:"parent_id"`  // nil = корневая категория
	Icon      string `json:"icon"`       // emoji
	Color     string `json:"color"`      // для графиков (#FF5733)
	SortOrder int    `json:"sort_order"` // порядок сортировки
	IsActive  bool   `json:"is_active"`  // для soft delete
}

// CategoryWithSubs категория с подкатегориями
type CategoryWithSubs struct {
	Category
	Subcategories []Category `json:"subcategories"`
}

// ExpenseByCategory расходы по категории
type ExpenseByCategory struct {
	CategoryID   int64   `json:"category_id"`
	CategoryName string  `json:"category_name"`
	Icon         string  `json:"icon"`
	Color        string  `json:"color"`
	Amount       float64 `json:"amount"`
	Percent      float64 `json:"percent"`
}
