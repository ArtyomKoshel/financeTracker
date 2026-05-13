package domain

// ValidationResult результат проверки выплаты
type ValidationResult struct {
	IsValid     bool    `json:"is_valid"`
	ExpectedMin float64 `json:"expected_min"`
	ExpectedMax float64 `json:"expected_max"`
	Actual      float64 `json:"actual"`
	Difference  float64 `json:"difference"`
	Message     string  `json:"message"`
}
