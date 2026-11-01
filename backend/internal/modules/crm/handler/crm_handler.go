package handler

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"tropical-fnb/backend/internal/modules/crm/domain"
	"tropical-fnb/backend/internal/modules/crm/usecase"
	iammw "tropical-fnb/backend/internal/modules/iam/middleware"
	"tropical-fnb/backend/internal/platform/httpx"
)

const maxBodyBytes = 1 << 20 // 1MB

type CRMHandler struct {
	uc  *usecase.CRMUsecase
	log *slog.Logger
}

func NewCRMHandler(uc *usecase.CRMUsecase, log *slog.Logger) *CRMHandler {
	return &CRMHandler{uc: uc, log: log}
}

func (h *CRMHandler) actor(w http.ResponseWriter, r *http.Request) (domain.Actor, bool) {
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
			perms[domain.PermCRMView] = struct{}{}
			perms[domain.PermCRMManage] = struct{}{}
		} else if role == "CASHIER" || role == "WAITER" || role == "HEAD_CHEF" || role == "KITCHEN_CHEF" || role == "SUPERVISOR" {
			perms[domain.PermCRMView] = struct{}{}
		}
	}
	return domain.Actor{
		TenantID:    tenantID,
		Username:    username,
		Roles:       roles,
		Permissions: perms,
	}, true
}

func (h *CRMHandler) fail(w http.ResponseWriter, r *http.Request, err error) {
	var domErr *domain.DomainError
	if errors.As(err, &domErr) {
		switch domErr.Kind {
		case domain.KindValidation:
			httpx.Error(w, r, http.StatusBadRequest, domErr.Code, domErr.Message)
		case domain.KindNotFound:
			httpx.Error(w, r, http.StatusNotFound, domErr.Code, domErr.Message)
		case domain.KindConflict:
			httpx.Error(w, r, http.StatusConflict, domErr.Code, domErr.Message)
		case domain.KindUnauthorized:
			httpx.Error(w, r, http.StatusForbidden, domErr.Code, domErr.Message)
		default:
			httpx.Error(w, r, http.StatusInternalServerError, domErr.Code, domErr.Message)
		}
		return
	}
	h.log.Error("crm unhandled error", "err", err)
	httpx.Error(w, r, http.StatusInternalServerError, "INTERNAL_ERROR", "Terjadi kesalahan internal pada sistem CRM")
}

// ListCustomers returns customers matching search or tier query.
func (h *CRMHandler) ListCustomers(w http.ResponseWriter, r *http.Request) {
	actor, ok := h.actor(w, r)
	if !ok {
		return
	}

	search := r.URL.Query().Get("q")
	var tier *string
	if t := r.URL.Query().Get("tier"); t != "" && t != "ALL" {
		tier = &t
	}

	customers, err := h.uc.ListCustomers(r.Context(), actor, search, tier)
	if err != nil {
		h.fail(w, r, err)
		return
	}

	httpx.JSON(w, http.StatusOK, httpx.NewListResponse(customers))
}

// GetCustomer returns details of one customer with recent points transactions.
func (h *CRMHandler) GetCustomer(w http.ResponseWriter, r *http.Request) {
	actor, ok := h.actor(w, r)
	if !ok {
		return
	}

	idStr := chi.URLParam(r, "id")
	customerID, err := uuid.Parse(idStr)
	if err != nil {
		httpx.Error(w, r, http.StatusBadRequest, "INVALID_ID", "ID pelanggan tidak valid")
		return
	}

	detail, err := h.uc.GetCustomerDetail(r.Context(), actor, customerID)
	if err != nil {
		h.fail(w, r, err)
		return
	}
	if detail != nil {
		detail.RecentPoints = httpx.EnsureSlice(detail.RecentPoints)
	}

	httpx.JSON(w, http.StatusOK, detail)
}

// CreateCustomer registers a new customer.
func (h *CRMHandler) CreateCustomer(w http.ResponseWriter, r *http.Request) {
	actor, ok := h.actor(w, r)
	if !ok {
		return
	}

	var req domain.CreateCustomerRequest
	r.Body = http.MaxBytesReader(w, r.Body, maxBodyBytes)
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpx.Error(w, r, http.StatusBadRequest, "MALFORMED_JSON", "Format JSON pelanggan tidak valid")
		return
	}

	cust, err := h.uc.CreateCustomer(r.Context(), actor, req)
	if err != nil {
		h.fail(w, r, err)
		return
	}

	httpx.JSON(w, http.StatusCreated, cust)
}

// UpdateCustomer updates customer metadata.
func (h *CRMHandler) UpdateCustomer(w http.ResponseWriter, r *http.Request) {
	actor, ok := h.actor(w, r)
	if !ok {
		return
	}

	idStr := chi.URLParam(r, "id")
	customerID, err := uuid.Parse(idStr)
	if err != nil {
		httpx.Error(w, r, http.StatusBadRequest, "INVALID_ID", "ID pelanggan tidak valid")
		return
	}

	var req domain.UpdateCustomerRequest
	r.Body = http.MaxBytesReader(w, r.Body, maxBodyBytes)
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpx.Error(w, r, http.StatusBadRequest, "MALFORMED_JSON", "Format JSON pembaruan tidak valid")
		return
	}

	cust, err := h.uc.UpdateCustomer(r.Context(), actor, customerID, req)
	if err != nil {
		h.fail(w, r, err)
		return
	}

	httpx.JSON(w, http.StatusOK, cust)
}

// AdjustCustomerPoints credits or debits points from a customer.
func (h *CRMHandler) AdjustCustomerPoints(w http.ResponseWriter, r *http.Request) {
	actor, ok := h.actor(w, r)
	if !ok {
		return
	}

	idStr := chi.URLParam(r, "id")
	customerID, err := uuid.Parse(idStr)
	if err != nil {
		httpx.Error(w, r, http.StatusBadRequest, "INVALID_ID", "ID pelanggan tidak valid")
		return
	}

	var req domain.AdjustPointsRequest
	r.Body = http.MaxBytesReader(w, r.Body, maxBodyBytes)
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpx.Error(w, r, http.StatusBadRequest, "MALFORMED_JSON", "Format JSON poin tidak valid")
		return
	}

	entry, err := h.uc.AdjustPoints(r.Context(), actor, customerID, req)
	if err != nil {
		h.fail(w, r, err)
		return
	}

	httpx.JSON(w, http.StatusCreated, entry)
}

// ListPointsLedger returns all ledger transactions.
func (h *CRMHandler) ListPointsLedger(w http.ResponseWriter, r *http.Request) {
	actor, ok := h.actor(w, r)
	if !ok {
		return
	}

	var customerID *uuid.UUID
	if cStr := r.URL.Query().Get("customer_id"); cStr != "" {
		if cid, err := uuid.Parse(cStr); err == nil {
			customerID = &cid
		}
	}

	limit := 50
	if lStr := r.URL.Query().Get("limit"); lStr != "" {
		if l, err := strconv.Atoi(lStr); err == nil && l > 0 {
			limit = l
		}
	}

	ledger, err := h.uc.ListPointsLedger(r.Context(), actor, customerID, limit)
	if err != nil {
		h.fail(w, r, err)
		return
	}

	httpx.JSON(w, http.StatusOK, httpx.NewListResponse(ledger))
}

// ListVouchers returns active and planned promo vouchers.
func (h *CRMHandler) ListVouchers(w http.ResponseWriter, r *http.Request) {
	actor, ok := h.actor(w, r)
	if !ok {
		return
	}

	vouchers, err := h.uc.ListVouchers(r.Context(), actor)
	if err != nil {
		h.fail(w, r, err)
		return
	}

	httpx.JSON(w, http.StatusOK, httpx.NewListResponse(vouchers))
}

// CreateVoucher registers a new discount voucher.
func (h *CRMHandler) CreateVoucher(w http.ResponseWriter, r *http.Request) {
	actor, ok := h.actor(w, r)
	if !ok {
		return
	}

	var req domain.CreateVoucherRequest
	r.Body = http.MaxBytesReader(w, r.Body, maxBodyBytes)
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpx.Error(w, r, http.StatusBadRequest, "MALFORMED_JSON", "Format JSON voucher tidak valid")
		return
	}

	voucher, err := h.uc.CreateVoucher(r.Context(), actor, req)
	if err != nil {
		h.fail(w, r, err)
		return
	}

	httpx.JSON(w, http.StatusCreated, voucher)
}

// ValidateVoucher evaluates whether a voucher code applies to an order subtotal.
func (h *CRMHandler) ValidateVoucher(w http.ResponseWriter, r *http.Request) {
	actor, ok := h.actor(w, r)
	if !ok {
		return
	}

	var req domain.ValidateVoucherRequest
	r.Body = http.MaxBytesReader(w, r.Body, maxBodyBytes)
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpx.Error(w, r, http.StatusBadRequest, "MALFORMED_JSON", "Format JSON validasi tidak valid")
		return
	}

	resp, err := h.uc.ValidateVoucher(r.Context(), actor, req)
	if err != nil {
		h.fail(w, r, err)
		return
	}

	httpx.JSON(w, http.StatusOK, resp)
}
