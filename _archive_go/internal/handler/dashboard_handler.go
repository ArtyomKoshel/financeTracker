package handler

import (
	"net/http"

	"finance-tracker/internal/service"
)

// DashboardHandler обработчик дашборда
type DashboardHandler struct {
	*BaseHandler
	dashboardSvc service.DashboardService
}

// NewDashboardHandler создаёт обработчик дашборда
func NewDashboardHandler(base *BaseHandler, dashboardSvc service.DashboardService) *DashboardHandler {
	return &DashboardHandler{
		BaseHandler:  base,
		dashboardSvc: dashboardSvc,
	}
}

// Get возвращает данные дашборда
func (h *DashboardHandler) Get(w http.ResponseWriter, r *http.Request) {
	data, err := h.dashboardSvc.GetDashboardData(r.Context())
	h.JSONResponse(w, data, err)
}
