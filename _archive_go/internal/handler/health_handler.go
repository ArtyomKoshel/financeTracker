package handler

import (
	"net/http"

	"finance-tracker/internal/service"
)

// HealthHandler обработчик финансового здоровья
type HealthHandler struct {
	*BaseHandler
	healthSvc *service.HealthServiceImpl
}

// NewHealthHandler создаёт обработчик здоровья
func NewHealthHandler(base *BaseHandler, healthSvc *service.HealthServiceImpl) *HealthHandler {
	return &HealthHandler{
		BaseHandler: base,
		healthSvc:   healthSvc,
	}
}

// GetHealth возвращает метрики финансового здоровья
func (h *HealthHandler) GetHealth(w http.ResponseWriter, r *http.Request) {
	health, err := h.healthSvc.CalculateHealth(r.Context())
	h.JSONResponse(w, health, err)
}
