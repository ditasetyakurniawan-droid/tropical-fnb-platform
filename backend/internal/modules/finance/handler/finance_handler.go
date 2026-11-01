package handler

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"

	"github.com/google/uuid"

	"tropical-fnb/backend/internal/modules/finance/domain"
	"tropical-fnb/backend/internal/modules/finance/usecase"
	iammw "tropical-fnb/backend/internal/modules/iam/middleware"
	"tropical-fnb/backend/internal/platform/httpx"
)

const maxBodyBytes = 1 << 20 // 1MB

type FinanceHandler struct {
	uc  *usecase.FinanceUsecase
	log *slog.Logger
}

func NewFinanceHandler(uc *usecase.FinanceUsecase, log *slog.Logger) *FinanceHandler {
	return &FinanceHandler{uc: uc, log: log}
}

func (h *FinanceHandler) actor(w http.ResponseWriter, r *http.Request) (domain.Actor, bool) {
	tenantID, ok := iammw.TenantIDFromContext(r.Context())
	username := iammw.UsernameFromContext(r.Context())
	if !ok || username == "" {
		httpx.Error(w, r, http.StatusUnauthorized, "unauthorized", "otentikasi diperlukan")
		return domain.Actor{}, false
	}
	roles := iammw.RolesFromContext(r.Context())
	perms := make(map[string]struct{})
	for _, role := range roles {
		if role == "OWNER" || role == "OUTLET_MANAGER" {
			perms[domain.PermFinanceView] = struct{}{}
			perms[domain.PermFinanceManage] = struct{}{}
			perms[domain.PermExpenseCreate] = struct{}{}
			perms[domain.PermExpenseApprove] = struct{}{}
		} else if role == "HEAD_CHEF" || role == "KITCHEN_CHEF" {
			perms[domain.PermFinanceView] = struct{}{}
			perms[domain.PermExpenseCreate] = struct{}{}
		}
	}
	return domain.Actor{
		TenantID:    tenantID,
		Username:    username,
		Roles:       roles,
		Permissions: perms,
	}, true
}

func (h *FinanceHandler) fail(w http.ResponseWriter, r *http.Request, err error) {
	var domErr *domain.DomainError
	if errors.As(err, &domErr) {
		switch domErr.Kind {
		case domain.KindValidation:
			httpx.Error(w, r, http.StatusUnprocessableEntity, "validation_error", domErr.Message)
		case domain.KindNotFound:
			httpx.Error(w, r, http.StatusNotFound, "not_found", domErr.Message)
		case domain.KindForbidden:
			httpx.Error(w, r, http.StatusForbidden, "forbidden", domErr.Message)
		case domain.KindConflict:
			httpx.Error(w, r, http.StatusConflict, "conflict", domErr.Message)
		case domain.KindUnauthorized:
			httpx.Error(w, r, http.StatusUnauthorized, "unauthorized", domErr.Message)
		}
		return
	}
	h.log.Error("internal server error in finance handler", "error", err, "path", r.URL.Path)
	httpx.Error(w, r, http.StatusInternalServerError, "internal_error", "terjadi kesalahan internal pada sistem keuangan")
}

func (h *FinanceHandler) ListCategories(w http.ResponseWriter, r *http.Request) {
	actor, ok := h.actor(w, r)
	if !ok {
		return
	}
	categories, err := h.uc.ListCategories(r.Context(), actor)
	if err != nil {
		h.fail(w, r, err)
		return
	}
	httpx.JSON(w, http.StatusOK, httpx.NewListResponse(categories))
}

func (h *FinanceHandler) ListExpenses(w http.ResponseWriter, r *http.Request) {
	actor, ok := h.actor(w, r)
	if !ok {
		return
	}

	var outletID *uuid.UUID
	if oStr := r.URL.Query().Get("outlet_id"); oStr != "" && oStr != "ALL" {
		if parsed, err := uuid.Parse(oStr); err == nil {
			outletID = &parsed
		}
	}

	startDate := r.URL.Query().Get("start_date")
	endDate := r.URL.Query().Get("end_date")

	expenses, err := h.uc.ListExpenses(r.Context(), actor, outletID, startDate, endDate)
	if err != nil {
		h.fail(w, r, err)
		return
	}
	httpx.JSON(w, http.StatusOK, httpx.NewListResponse(expenses))
}

func (h *FinanceHandler) CreateExpense(w http.ResponseWriter, r *http.Request) {
	actor, ok := h.actor(w, r)
	if !ok {
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, maxBodyBytes)
	var in domain.CreateExpenseInput
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		httpx.Error(w, r, http.StatusBadRequest, "bad_request", "format JSON tidak valid")
		return
	}

	exp, err := h.uc.CreateExpense(r.Context(), actor, in)
	if err != nil {
		h.fail(w, r, err)
		return
	}
	httpx.JSON(w, http.StatusCreated, exp)
}

func (h *FinanceHandler) GetPnL(w http.ResponseWriter, r *http.Request) {
	actor, ok := h.actor(w, r)
	if !ok {
		return
	}

	var outletID *uuid.UUID
	if oStr := r.URL.Query().Get("outlet_id"); oStr != "" && oStr != "ALL" {
		if parsed, err := uuid.Parse(oStr); err == nil {
			outletID = &parsed
		}
	}

	startDate := r.URL.Query().Get("start_date")
	endDate := r.URL.Query().Get("end_date")

	pnl, err := h.uc.GetPnLSummary(r.Context(), actor, outletID, startDate, endDate)
	if err != nil {
		h.fail(w, r, err)
		return
	}
	httpx.JSON(w, http.StatusOK, pnl)
}

func (h *FinanceHandler) GetBEP(w http.ResponseWriter, r *http.Request) {
	actor, ok := h.actor(w, r)
	if !ok {
		return
	}

	var outletID *uuid.UUID
	if oStr := r.URL.Query().Get("outlet_id"); oStr != "" && oStr != "ALL" {
		if parsed, err := uuid.Parse(oStr); err == nil {
			outletID = &parsed
		}
	}

	bep, err := h.uc.GetBEPSummary(r.Context(), actor, outletID)
	if err != nil {
		h.fail(w, r, err)
		return
	}
	httpx.JSON(w, http.StatusOK, bep)
}
