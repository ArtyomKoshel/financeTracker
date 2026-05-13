package handler

import (
	"encoding/json"
	"net/http"
)

// APIResponse стандартный ответ API
type APIResponse struct {
	Success bool        `json:"success"`
	Data    interface{} `json:"data,omitempty"`
	Error   string      `json:"error,omitempty"`
}

// Notifier интерфейс для отправки уведомлений
type Notifier interface {
	BroadcastUpdate(target string)
}

// BaseHandler базовый обработчик с общими методами
type BaseHandler struct {
	notifier Notifier
}

// NewBaseHandler создаёт базовый обработчик
func NewBaseHandler(notifier Notifier) *BaseHandler {
	return &BaseHandler{notifier: notifier}
}

// JSONResponse отправляет JSON ответ
func (h *BaseHandler) JSONResponse(w http.ResponseWriter, data interface{}, err error) {
	w.Header().Set("Content-Type", "application/json")

	resp := APIResponse{Success: err == nil}
	if err != nil {
		resp.Error = err.Error()
		w.WriteHeader(http.StatusBadRequest)
	} else {
		resp.Data = data
	}

	if encErr := json.NewEncoder(w).Encode(resp); encErr != nil {
		http.Error(w, "Failed to encode response", http.StatusInternalServerError)
	}
}

// ErrorResponse отправляет JSON ответ с ошибкой и указанным статус-кодом
func (h *BaseHandler) ErrorResponse(w http.ResponseWriter, err error, status int) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	resp := APIResponse{Success: false, Error: err.Error()}
	json.NewEncoder(w).Encode(resp)
}

// NotifyUpdate отправляет уведомление об обновлении
func (h *BaseHandler) NotifyUpdate(target string) {
	if h.notifier != nil {
		h.notifier.BroadcastUpdate(target)
	}
}
