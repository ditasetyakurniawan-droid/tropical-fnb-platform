// Package handler provides HTTP endpoints for POS cashiering, dining tables,
// zero-leak split billing, and event reservations.
package handler

import (
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	iammw "tropical-fnb/backend/internal/modules/iam/middleware"
	"tropical-fnb/backend/internal/modules/pos/domain"
	"tropical-fnb/backend/internal/modules/pos/usecase"
	"tropical-fnb/backend/internal/platform/httpx"
	"tropical-fnb/backend/internal/platform/logger"
)

// POSHandler serves HTTP endpoints for the POS module.
type POSHandler struct {
	posUsecase *usecase.POSUsecase
	log        *slog.Logger
}

// NewPOSHandler creates a new POSHandler.
func NewPOSHandler(posUsecase *usecase.POSUsecase, log *slog.Logger) *POSHandler {
	return &POSHandler{
		posUsecase: posUsecase,
		log:        log,
	}
}

func (h *POSHandler) handleError(w http.ResponseWriter, r *http.Request, err error, defaultMsg string) {
	if ue, ok := domain.AsUserError(err); ok {
		code := ue.Code
		if code == "" {
			switch ue.Kind {
			case domain.KindNotFound:
				code = "not_found"
			case domain.KindConflict:
				code = "conflict"
			default:
				code = "bad_request"
			}
		}
		status := http.StatusBadRequest
		switch ue.Kind {
		case domain.KindNotFound:
			status = http.StatusNotFound
		case domain.KindConflict:
			status = http.StatusConflict
		default:
			status = http.StatusBadRequest
		}
		logger.Annotate(r.Context(), "error_code", code)
		httpx.Error(w, r, status, code, ue.Msg)
		return
	}

	h.log.ErrorContext(r.Context(), "pos_internal_error",
		"error", err.Error(),
		"path", r.URL.Path,
	)
	httpx.Error(w, r, http.StatusInternalServerError, "internal_error", defaultMsg)
}

func (h *POSHandler) authorizeOrder(w http.ResponseWriter, r *http.Request, tenantID, orderID uuid.UUID) (*domain.Order, bool) {
	ord, err := h.posUsecase.GetOrderByID(r.Context(), tenantID, orderID)
	if err != nil {
		h.handleError(w, r, err, "order tidak ditemukan")
		return nil, false
	}
	if !iammw.RequireOutletAccess(r.Context(), ord.OutletID) {
		logger.Annotate(r.Context(), "error_code", "outlet_forbidden")
		httpx.Error(w, r, http.StatusForbidden, "forbidden", "akses ditolak: bukan outlet anda (BOLA protection)")
		return nil, false
	}
	return ord, true
}

func (h *POSHandler) resolveTenantAndOutlet(r *http.Request) (uuid.UUID, *uuid.UUID, bool) {
	tenantID, ok := iammw.TenantIDFromContext(r.Context())
	if !ok {
		return uuid.Nil, nil, false
	}

	var outletID *uuid.UUID
	if oid, ok := iammw.ActiveOutletIDFromContext(r.Context()); ok {
		outletID = &oid
	} else if q := r.URL.Query().Get("outlet_id"); q != "" && q != "ALL" {
		if parsed, err := uuid.Parse(q); err == nil {
			outletID = &parsed
		}
	}
	return tenantID, outletID, true
}

// ListTables handles GET /api/v1/pos/tables.
func (h *POSHandler) ListTables(w http.ResponseWriter, r *http.Request) {
	tenantID, outletID, ok := h.resolveTenantAndOutlet(r)
	if !ok {
		httpx.Error(w, r, http.StatusUnauthorized, "unauthorized", "otentikasi diperlukan")
		return
	}

	var section *string
	if s := r.URL.Query().Get("section"); s != "" && s != "ALL" {
		section = &s
	}

	tables, err := h.posUsecase.ListTables(r.Context(), tenantID, outletID, section)
	if err != nil {
		httpx.Error(w, r, http.StatusInternalServerError, "internal_error", "gagal mengambil status meja")
		return
	}

	httpx.JSON(w, http.StatusOK, httpx.NewListResponse(tables))
}

// UpdateTableStatus handles PATCH /api/v1/pos/tables/{id}/status.
func (h *POSHandler) UpdateTableStatus(w http.ResponseWriter, r *http.Request) {
	tenantID, _, ok := h.resolveTenantAndOutlet(r)
	if !ok {
		httpx.Error(w, r, http.StatusUnauthorized, "unauthorized", "otentikasi diperlukan")
		return
	}

	tableID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpx.Error(w, r, http.StatusBadRequest, "invalid_id", "ID meja tidak valid")
		return
	}

	var req struct {
		Status string `json:"status"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpx.Error(w, r, http.StatusBadRequest, "invalid_payload", "format payload tidak valid")
		return
	}

	if err := h.posUsecase.UpdateTableStatus(r.Context(), tenantID, tableID, req.Status); err != nil {
		httpx.Error(w, r, http.StatusInternalServerError, "internal_error", err.Error())
		return
	}

	httpx.JSON(w, http.StatusOK, map[string]string{"status": "updated"})
}

// ListOrders handles GET /api/v1/pos/orders.
func (h *POSHandler) ListOrders(w http.ResponseWriter, r *http.Request) {
	tenantID, outletID, ok := h.resolveTenantAndOutlet(r)
	if !ok {
		httpx.Error(w, r, http.StatusUnauthorized, "unauthorized", "otentikasi diperlukan")
		return
	}

	var status *string
	if s := r.URL.Query().Get("status"); s != "" && s != "ALL" {
		status = &s
	}

	orders, err := h.posUsecase.ListOrders(r.Context(), tenantID, outletID, status)
	if err != nil {
		httpx.Error(w, r, http.StatusInternalServerError, "internal_error", "gagal mengambil daftar order")
		return
	}

	httpx.JSON(w, http.StatusOK, httpx.NewListResponse(orders))
}

// GetOrderByID handles GET /api/v1/pos/orders/{id}.
func (h *POSHandler) GetOrderByID(w http.ResponseWriter, r *http.Request) {
	tenantID, _, ok := h.resolveTenantAndOutlet(r)
	if !ok {
		httpx.Error(w, r, http.StatusUnauthorized, "unauthorized", "otentikasi diperlukan")
		return
	}

	orderID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpx.Error(w, r, http.StatusBadRequest, "invalid_id", "ID order tidak valid")
		return
	}

	ord, ok := h.authorizeOrder(w, r, tenantID, orderID)
	if !ok {
		return
	}
	ord.Items = httpx.EnsureSlice(ord.Items)
	ord.Payments = httpx.EnsureSlice(ord.Payments)

	httpx.JSON(w, http.StatusOK, ord)
}

// CreateOrder handles POST /api/v1/pos/orders.
func (h *POSHandler) CreateOrder(w http.ResponseWriter, r *http.Request) {
	tenantID, outletID, ok := h.resolveTenantAndOutlet(r)
	if !ok {
		httpx.Error(w, r, http.StatusUnauthorized, "unauthorized", "otentikasi diperlukan")
		return
	}

	var req domain.CreateOrderRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpx.Error(w, r, http.StatusBadRequest, "invalid_payload", "format data order tidak valid")
		return
	}

	if req.OutletID == uuid.Nil && outletID != nil {
		req.OutletID = *outletID
	}
	if req.OutletID == uuid.Nil {
		httpx.Error(w, r, http.StatusBadRequest, "missing_outlet", "outlet_id diperlukan")
		return
	}
	if !iammw.RequireOutletAccess(r.Context(), req.OutletID) {
		logger.Annotate(r.Context(), "error_code", "outlet_forbidden")
		httpx.Error(w, r, http.StatusForbidden, "forbidden", "anda tidak memiliki akses ke outlet ini (BOLA protection)")
		return
	}

	username := iammw.UsernameFromContext(r.Context())
	userID, _ := h.posUsecase.GetUserIDByUsername(r.Context(), tenantID, username)

	names, prices, err := h.posUsecase.GetMenuItemMap(r.Context(), tenantID)
	if err != nil {
		httpx.Error(w, r, http.StatusInternalServerError, "internal_error", "gagal memvalidasi menu")
		return
	}

	ord, err := h.posUsecase.CreateOrder(r.Context(), tenantID, userID, req, names, prices)
	if err != nil {
		h.handleError(w, r, err, "gagal membuat pesanan")
		return
	}
	if ord != nil {
		ord.Items = httpx.EnsureSlice(ord.Items)
		ord.Payments = httpx.EnsureSlice(ord.Payments)
		h.log.InfoContext(r.Context(), "pos_order_created",
			"order_id", ord.ID,
			"order_number", ord.OrderNumber,
			"outlet_id", ord.OutletID,
			"final_total", ord.FinalTotal,
		)
	}

	httpx.JSON(w, http.StatusCreated, ord)
}

// AddOrderItems handles POST /api/v1/pos/orders/{id}/items.
func (h *POSHandler) AddOrderItems(w http.ResponseWriter, r *http.Request) {
	tenantID, _, ok := h.resolveTenantAndOutlet(r)
	if !ok {
		httpx.Error(w, r, http.StatusUnauthorized, "unauthorized", "otentikasi diperlukan")
		return
	}

	orderID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpx.Error(w, r, http.StatusBadRequest, "invalid_id", "ID order tidak valid")
		return
	}

	_, ok = h.authorizeOrder(w, r, tenantID, orderID)
	if !ok {
		return
	}

	bodyBytes, err := io.ReadAll(r.Body)
	if err != nil {
		httpx.Error(w, r, http.StatusBadRequest, "invalid_payload", "gagal membaca payload")
		return
	}

	var reqItems []domain.CreateOrderItemRequest
	if err := json.Unmarshal(bodyBytes, &reqItems); err != nil {
		var wrapper struct {
			Items []domain.CreateOrderItemRequest `json:"items"`
		}
		if err2 := json.Unmarshal(bodyBytes, &wrapper); err2 != nil {
			httpx.Error(w, r, http.StatusBadRequest, "invalid_payload", "format data item tidak valid")
			return
		}
		reqItems = wrapper.Items
	}

	names, prices, err := h.posUsecase.GetMenuItemMap(r.Context(), tenantID)
	if err != nil {
		httpx.Error(w, r, http.StatusInternalServerError, "internal_error", "gagal memvalidasi menu")
		return
	}

	var items []domain.OrderItem
	for _, itReq := range reqItems {
		name, exists := names[itReq.MenuItemID]
		if !exists {
			httpx.Error(w, r, http.StatusBadRequest, "menu_not_found", "menu tidak ditemukan")
			return
		}
		price := prices[itReq.MenuItemID]
		items = append(items, domain.OrderItem{
			MenuItemID: itReq.MenuItemID,
			ItemName:   name,
			UnitPrice:  price,
			Quantity:   itReq.Quantity,
			Subtotal:   price * float64(itReq.Quantity),
			Notes:      itReq.Notes,
		})
	}

	ord, err := h.posUsecase.AddOrderItems(r.Context(), tenantID, orderID, items)
	if err != nil {
		h.handleError(w, r, err, "gagal menambahkan menu ke pesanan")
		return
	}
	if ord != nil {
		ord.Items = httpx.EnsureSlice(ord.Items)
		ord.Payments = httpx.EnsureSlice(ord.Payments)
	}

	httpx.JSON(w, http.StatusOK, ord)
}

// ProcessPayment handles POST /api/v1/pos/orders/{id}/pay.
func (h *POSHandler) ProcessPayment(w http.ResponseWriter, r *http.Request) {
	tenantID, _, ok := h.resolveTenantAndOutlet(r)
	if !ok {
		httpx.Error(w, r, http.StatusUnauthorized, "unauthorized", "otentikasi diperlukan")
		return
	}

	orderID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpx.Error(w, r, http.StatusBadRequest, "invalid_id", "ID order tidak valid")
		return
	}

	targetOrder, ok := h.authorizeOrder(w, r, tenantID, orderID)
	if !ok {
		return
	}

	var req domain.ProcessPaymentRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpx.Error(w, r, http.StatusBadRequest, "invalid_payload", "format pembayaran tidak valid")
		return
	}

	ord, err := h.posUsecase.ProcessPayment(r.Context(), tenantID, orderID, req)
	if err != nil {
		h.handleError(w, r, err, "gagal memproses pembayaran")
		return
	}
	if ord != nil {
		ord.Items = httpx.EnsureSlice(ord.Items)
		ord.Payments = httpx.EnsureSlice(ord.Payments)
		h.log.InfoContext(r.Context(), "pos_payment_processed",
			"order_id", ord.ID,
			"order_number", ord.OrderNumber,
			"outlet_id", targetOrder.OutletID,
			"payment_method", req.PaymentMethod,
			"amount", req.Amount,
			"payment_status", ord.PaymentStatus,
			"status", ord.Status,
		)
	}

	httpx.JSON(w, http.StatusOK, ord)
}

// SplitBillEvenly handles POST /api/v1/pos/orders/{id}/split/evenly.
func (h *POSHandler) SplitBillEvenly(w http.ResponseWriter, r *http.Request) {
	tenantID, _, ok := h.resolveTenantAndOutlet(r)
	if !ok {
		httpx.Error(w, r, http.StatusUnauthorized, "unauthorized", "otentikasi diperlukan")
		return
	}

	orderID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpx.Error(w, r, http.StatusBadRequest, "invalid_id", "ID order tidak valid")
		return
	}

	_, ok = h.authorizeOrder(w, r, tenantID, orderID)
	if !ok {
		return
	}

	var req domain.SplitEvenlyRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpx.Error(w, r, http.StatusBadRequest, "invalid_payload", "format data split tidak valid")
		return
	}

	splits, err := h.posUsecase.SplitBillEvenly(r.Context(), tenantID, orderID, req.NumPersons)
	if err != nil {
		h.handleError(w, r, err, "gagal memproses split bill")
		return
	}

	httpx.JSON(w, http.StatusOK, httpx.NewListResponse(splits))
}

// SplitBillByItems handles POST /api/v1/pos/orders/{id}/split/by-items.
func (h *POSHandler) SplitBillByItems(w http.ResponseWriter, r *http.Request) {
	tenantID, _, ok := h.resolveTenantAndOutlet(r)
	if !ok {
		httpx.Error(w, r, http.StatusUnauthorized, "unauthorized", "otentikasi diperlukan")
		return
	}

	orderID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpx.Error(w, r, http.StatusBadRequest, "invalid_id", "ID order tidak valid")
		return
	}

	_, ok = h.authorizeOrder(w, r, tenantID, orderID)
	if !ok {
		return
	}

	var req domain.SplitByItemsRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpx.Error(w, r, http.StatusBadRequest, "invalid_payload", "format data split tidak valid")
		return
	}

	splits, err := h.posUsecase.SplitBillByItems(r.Context(), tenantID, orderID, req)
	if err != nil {
		h.handleError(w, r, err, "gagal memproses split bill")
		return
	}

	httpx.JSON(w, http.StatusOK, httpx.NewListResponse(splits))
}

// PaySplitBill handles POST /api/v1/pos/orders/{id}/split/{split_id}/pay.
func (h *POSHandler) PaySplitBill(w http.ResponseWriter, r *http.Request) {
	tenantID, _, ok := h.resolveTenantAndOutlet(r)
	if !ok {
		httpx.Error(w, r, http.StatusUnauthorized, "unauthorized", "otentikasi diperlukan")
		return
	}

	orderID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpx.Error(w, r, http.StatusBadRequest, "invalid_id", "ID order tidak valid")
		return
	}

	splitID, err := uuid.Parse(chi.URLParam(r, "split_id"))
	if err != nil {
		httpx.Error(w, r, http.StatusBadRequest, "invalid_id", "ID split bill tidak valid")
		return
	}

	targetOrder, ok := h.authorizeOrder(w, r, tenantID, orderID)
	if !ok {
		return
	}

	var req domain.PaySplitBillRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpx.Error(w, r, http.StatusBadRequest, "invalid_payload", "format pembayaran tidak valid")
		return
	}

	split, ord, err := h.posUsecase.PaySplitBill(r.Context(), tenantID, orderID, splitID, req.PaymentMethod, req.Amount)
	if err != nil {
		h.handleError(w, r, err, "gagal memproses pembayaran split")
		return
	}
	if split != nil && ord != nil {
		ord.Items = httpx.EnsureSlice(ord.Items)
		ord.Payments = httpx.EnsureSlice(ord.Payments)
		h.log.InfoContext(r.Context(), "pos_split_payment_processed",
			"order_id", ord.ID,
			"order_number", ord.OrderNumber,
			"outlet_id", targetOrder.OutletID,
			"split_id", split.ID,
			"payment_method", req.PaymentMethod,
			"amount", req.Amount,
		)
	}

	httpx.JSON(w, http.StatusOK, map[string]any{
		"split_bill": split,
		"order":      ord,
	})
}

// ListReservations handles GET /api/v1/pos/reservations.
func (h *POSHandler) ListReservations(w http.ResponseWriter, r *http.Request) {
	tenantID, outletID, ok := h.resolveTenantAndOutlet(r)
	if !ok {
		httpx.Error(w, r, http.StatusUnauthorized, "unauthorized", "otentikasi diperlukan")
		return
	}

	var date *string
	if d := r.URL.Query().Get("date"); d != "" {
		date = &d
	}

	reservations, err := h.posUsecase.ListReservations(r.Context(), tenantID, outletID, date)
	if err != nil {
		httpx.Error(w, r, http.StatusInternalServerError, "internal_error", "gagal mengambil daftar reservasi")
		return
	}

	httpx.JSON(w, http.StatusOK, httpx.NewListResponse(reservations))
}

// CreateReservation handles POST /api/v1/pos/reservations.
func (h *POSHandler) CreateReservation(w http.ResponseWriter, r *http.Request) {
	tenantID, outletID, ok := h.resolveTenantAndOutlet(r)
	if !ok {
		httpx.Error(w, r, http.StatusUnauthorized, "unauthorized", "otentikasi diperlukan")
		return
	}

	var req domain.CreateReservationRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpx.Error(w, r, http.StatusBadRequest, "invalid_payload", "format data reservasi tidak valid")
		return
	}

	if req.OutletID == uuid.Nil && outletID != nil {
		req.OutletID = *outletID
	}
	if req.OutletID == uuid.Nil {
		httpx.Error(w, r, http.StatusBadRequest, "missing_outlet", "outlet_id diperlukan")
		return
	}
	if !iammw.RequireOutletAccess(r.Context(), req.OutletID) {
		logger.Annotate(r.Context(), "error_code", "outlet_forbidden")
		httpx.Error(w, r, http.StatusForbidden, "forbidden", "anda tidak memiliki akses ke outlet ini (BOLA protection)")
		return
	}

	res, err := h.posUsecase.CreateReservation(r.Context(), tenantID, req)
	if err != nil {
		h.handleError(w, r, err, "gagal membuat reservasi")
		return
	}

	httpx.JSON(w, http.StatusCreated, res)
}

// CheckInReservation handles POST /api/v1/pos/reservations/{id}/check-in.
func (h *POSHandler) CheckInReservation(w http.ResponseWriter, r *http.Request) {
	tenantID, _, ok := h.resolveTenantAndOutlet(r)
	if !ok {
		httpx.Error(w, r, http.StatusUnauthorized, "unauthorized", "otentikasi diperlukan")
		return
	}

	resID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpx.Error(w, r, http.StatusBadRequest, "invalid_id", "ID reservasi tidak valid")
		return
	}

	var req struct {
		TableID uuid.UUID `json:"table_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.TableID == uuid.Nil {
		httpx.Error(w, r, http.StatusBadRequest, "invalid_payload", "table_id diperlukan")
		return
	}

	username := iammw.UsernameFromContext(r.Context())
	userID, _ := h.posUsecase.GetUserIDByUsername(r.Context(), tenantID, username)

	ord, err := h.posUsecase.CheckInReservation(r.Context(), tenantID, resID, req.TableID, userID)
	if err != nil {
		httpx.Error(w, r, http.StatusBadRequest, "check_in_failed", err.Error())
		return
	}
	if ord != nil {
		ord.Items = httpx.EnsureSlice(ord.Items)
		ord.Payments = httpx.EnsureSlice(ord.Payments)
	}

	httpx.JSON(w, http.StatusOK, ord)
}

// ListBanquetPackages handles GET /api/v1/pos/banquet-packages.
func (h *POSHandler) ListBanquetPackages(w http.ResponseWriter, r *http.Request) {
	tenantID, outletID, ok := h.resolveTenantAndOutlet(r)
	if !ok {
		httpx.Error(w, r, http.StatusUnauthorized, "unauthorized", "otentikasi diperlukan")
		return
	}

	pkgs, err := h.posUsecase.ListBanquetPackages(r.Context(), tenantID, outletID)
	if err != nil {
		httpx.Error(w, r, http.StatusInternalServerError, "internal_error", "gagal memuat paket banquet")
		return
	}

	httpx.JSON(w, http.StatusOK, httpx.NewListResponse(pkgs))
}

// CreateBanquetPackage handles POST /api/v1/pos/banquet-packages.
func (h *POSHandler) CreateBanquetPackage(w http.ResponseWriter, r *http.Request) {
	tenantID, _, ok := h.resolveTenantAndOutlet(r)
	if !ok {
		httpx.Error(w, r, http.StatusUnauthorized, "unauthorized", "otentikasi diperlukan")
		return
	}

	var pkg domain.BanquetPackage
	if err := json.NewDecoder(r.Body).Decode(&pkg); err != nil {
		httpx.Error(w, r, http.StatusBadRequest, "invalid_payload", "format data tidak valid")
		return
	}

	created, err := h.posUsecase.CreateBanquetPackage(r.Context(), tenantID, &pkg)
	if err != nil {
		httpx.Error(w, r, http.StatusBadRequest, "bad_request", err.Error())
		return
	}

	httpx.JSON(w, http.StatusCreated, created)
}

// ListReservationPreorders handles GET /api/v1/pos/reservations/{id}/preorders.
func (h *POSHandler) ListReservationPreorders(w http.ResponseWriter, r *http.Request) {
	tenantID, _, ok := h.resolveTenantAndOutlet(r)
	if !ok {
		httpx.Error(w, r, http.StatusUnauthorized, "unauthorized", "otentikasi diperlukan")
		return
	}

	resID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpx.Error(w, r, http.StatusBadRequest, "invalid_id", "ID reservasi tidak valid")
		return
	}

	preorders, err := h.posUsecase.ListReservationPreorders(r.Context(), tenantID, resID)
	if err != nil {
		httpx.Error(w, r, http.StatusInternalServerError, "internal_error", "gagal memuat pre-order reservasi")
		return
	}

	httpx.JSON(w, http.StatusOK, httpx.NewListResponse(preorders))
}

// AddReservationPreorder handles POST /api/v1/pos/reservations/{id}/preorders.
func (h *POSHandler) AddReservationPreorder(w http.ResponseWriter, r *http.Request) {
	tenantID, _, ok := h.resolveTenantAndOutlet(r)
	if !ok {
		httpx.Error(w, r, http.StatusUnauthorized, "unauthorized", "otentikasi diperlukan")
		return
	}

	resID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpx.Error(w, r, http.StatusBadRequest, "invalid_id", "ID reservasi tidak valid")
		return
	}

	var po domain.ReservationPreorder
	if err := json.NewDecoder(r.Body).Decode(&po); err != nil {
		httpx.Error(w, r, http.StatusBadRequest, "invalid_payload", "format data tidak valid")
		return
	}

	created, err := h.posUsecase.AddReservationPreorder(r.Context(), tenantID, resID, &po)
	if err != nil {
		httpx.Error(w, r, http.StatusBadRequest, "bad_request", err.Error())
		return
	}

	httpx.JSON(w, http.StatusCreated, created)
}

// UpdateReservationPrepStatus handles PUT /api/v1/pos/reservations/{id}/prep-status.
func (h *POSHandler) UpdateReservationPrepStatus(w http.ResponseWriter, r *http.Request) {
	tenantID, _, ok := h.resolveTenantAndOutlet(r)
	if !ok {
		httpx.Error(w, r, http.StatusUnauthorized, "unauthorized", "otentikasi diperlukan")
		return
	}

	resID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpx.Error(w, r, http.StatusBadRequest, "invalid_id", "ID reservasi tidak valid")
		return
	}

	var req struct {
		PrepStatus string `json:"prep_status"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.PrepStatus == "" {
		httpx.Error(w, r, http.StatusBadRequest, "invalid_payload", "prep_status diperlukan")
		return
	}

	if err := h.posUsecase.UpdateReservationPrepStatus(r.Context(), tenantID, resID, req.PrepStatus); err != nil {
		httpx.Error(w, r, http.StatusBadRequest, "bad_request", err.Error())
		return
	}

	httpx.JSON(w, http.StatusOK, map[string]string{"message": "status persiapan dapur berhasil diperbarui", "prep_status": req.PrepStatus})
}

// SendReservationWAReminder handles POST /api/v1/pos/reservations/{id}/wa-reminder.
func (h *POSHandler) SendReservationWAReminder(w http.ResponseWriter, r *http.Request) {
	tenantID, _, ok := h.resolveTenantAndOutlet(r)
	if !ok {
		httpx.Error(w, r, http.StatusUnauthorized, "unauthorized", "otentikasi diperlukan")
		return
	}

	resID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpx.Error(w, r, http.StatusBadRequest, "invalid_id", "ID reservasi tidak valid")
		return
	}

	res, err := h.posUsecase.SendReservationWAReminder(r.Context(), tenantID, resID)
	if err != nil {
		httpx.Error(w, r, http.StatusBadRequest, "bad_request", err.Error())
		return
	}

	httpx.JSON(w, http.StatusOK, res)
}

// ListKitchenTickets handles GET /api/v1/pos/kds/tickets.
func (h *POSHandler) ListKitchenTickets(w http.ResponseWriter, r *http.Request) {
	tenantID, outletID, ok := h.resolveTenantAndOutlet(r)
	if !ok {
		httpx.Error(w, r, http.StatusUnauthorized, "unauthorized", "otentikasi diperlukan")
		return
	}

	var station *string
	if s := r.URL.Query().Get("station"); s != "" && s != "ALL" {
		station = &s
	}

	includeServed := r.URL.Query().Get("include_served") == "true"

	tickets, err := h.posUsecase.ListKitchenTickets(r.Context(), tenantID, outletID, station, includeServed)
	if err != nil {
		httpx.Error(w, r, http.StatusInternalServerError, "internal_error", "gagal mengambil tiket dapur")
		return
	}

	httpx.JSON(w, http.StatusOK, httpx.NewListResponse(tickets))
}

// UpdateOrderItemStatus handles PATCH /api/v1/pos/kds/orders/{order_id}/items/{item_id}/status.
func (h *POSHandler) UpdateOrderItemStatus(w http.ResponseWriter, r *http.Request) {
	tenantID, _, ok := h.resolveTenantAndOutlet(r)
	if !ok {
		httpx.Error(w, r, http.StatusUnauthorized, "unauthorized", "otentikasi diperlukan")
		return
	}

	orderID, err := uuid.Parse(chi.URLParam(r, "order_id"))
	if err != nil {
		httpx.Error(w, r, http.StatusBadRequest, "invalid_id", "ID order tidak valid")
		return
	}

	itemID, err := uuid.Parse(chi.URLParam(r, "item_id"))
	if err != nil {
		httpx.Error(w, r, http.StatusBadRequest, "invalid_id", "ID item tidak valid")
		return
	}

	_, ok = h.authorizeOrder(w, r, tenantID, orderID)
	if !ok {
		return
	}

	var req struct {
		Status string `json:"status"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Status == "" {
		httpx.Error(w, r, http.StatusBadRequest, "invalid_payload", "status diperlukan")
		return
	}

	if err := h.posUsecase.UpdateOrderItemStatus(r.Context(), tenantID, orderID, itemID, req.Status); err != nil {
		h.handleError(w, r, err, "gagal memperbarui status item")
		return
	}

	httpx.JSON(w, http.StatusOK, map[string]string{"status": "updated"})
}

// UpdateOrderStatus handles PATCH /api/v1/pos/kds/orders/{id}/status.
func (h *POSHandler) UpdateOrderStatus(w http.ResponseWriter, r *http.Request) {
	tenantID, _, ok := h.resolveTenantAndOutlet(r)
	if !ok {
		httpx.Error(w, r, http.StatusUnauthorized, "unauthorized", "otentikasi diperlukan")
		return
	}

	orderID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpx.Error(w, r, http.StatusBadRequest, "invalid_id", "ID order tidak valid")
		return
	}

	_, ok = h.authorizeOrder(w, r, tenantID, orderID)
	if !ok {
		return
	}

	var req struct {
		Status string `json:"status"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Status == "" {
		httpx.Error(w, r, http.StatusBadRequest, "invalid_payload", "status diperlukan")
		return
	}

	// Void / Cancel requires privileged role
	if req.Status == "CANCELLED" || req.Status == "VOID" {
		roles := iammw.RolesFromContext(r.Context())
		canCancel := false
		for _, ro := range roles {
			if ro == "SUPERADMIN" || ro == "OWNER" || ro == "SUPERVISOR" || ro == "STORE_MANAGER" {
				canCancel = true
				break
			}
		}
		if !canCancel {
			httpx.Error(w, r, http.StatusForbidden, "forbidden", "pembatalan order (VOID/CANCEL) memerlukan otorisasi Supervisor atau Owner")
			return
		}
	}

	if err := h.posUsecase.UpdateOrderStatus(r.Context(), tenantID, orderID, req.Status); err != nil {
		h.handleError(w, r, err, "gagal memperbarui status order")
		return
	}

	httpx.JSON(w, http.StatusOK, map[string]string{"status": "updated"})
}

// BumpTicket handles POST /api/v1/pos/kds/orders/{id}/bump.
func (h *POSHandler) BumpTicket(w http.ResponseWriter, r *http.Request) {
	tenantID, _, ok := h.resolveTenantAndOutlet(r)
	if !ok {
		httpx.Error(w, r, http.StatusUnauthorized, "unauthorized", "otentikasi diperlukan")
		return
	}

	orderID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpx.Error(w, r, http.StatusBadRequest, "invalid_id", "ID order tidak valid")
		return
	}

	_, ok = h.authorizeOrder(w, r, tenantID, orderID)
	if !ok {
		return
	}

	var req struct {
		TargetStatus string `json:"target_status"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.TargetStatus == "" {
		req.TargetStatus = "READY"
	}

	ticket, err := h.posUsecase.BumpTicket(r.Context(), tenantID, orderID, req.TargetStatus)
	if err != nil {
		h.handleError(w, r, err, "gagal memproses bump tiket")
		return
	}

	httpx.JSON(w, http.StatusOK, ticket)
}

// ----------------------------------------------------------------------------
// Shift Management & Cash Drawer Handlers
// ----------------------------------------------------------------------------

// GetCurrentShift handles GET /api/v1/pos/shifts/current.
func (h *POSHandler) GetCurrentShift(w http.ResponseWriter, r *http.Request) {
	tenantID, outletID, ok := h.resolveTenantAndOutlet(r)
	if !ok {
		httpx.Error(w, r, http.StatusUnauthorized, "unauthorized", "otentikasi diperlukan")
		return
	}
	if outletID == nil {
		httpx.Error(w, r, http.StatusBadRequest, "missing_outlet", "outlet_id diperlukan")
		return
	}

	shift, err := h.posUsecase.GetCurrentOpenShift(r.Context(), tenantID, *outletID)
	if err != nil {
		httpx.Error(w, r, http.StatusInternalServerError, "internal_error", err.Error())
		return
	}

	if shift == nil {
		httpx.JSON(w, http.StatusOK, map[string]any{
			"shift":   nil,
			"is_open": false,
		})
		return
	}

	httpx.JSON(w, http.StatusOK, map[string]any{
		"shift":   shift,
		"is_open": true,
	})
}

// OpenShift handles POST /api/v1/pos/shifts/open.
func (h *POSHandler) OpenShift(w http.ResponseWriter, r *http.Request) {
	tenantID, outletID, ok := h.resolveTenantAndOutlet(r)
	if !ok {
		httpx.Error(w, r, http.StatusUnauthorized, "unauthorized", "otentikasi diperlukan")
		return
	}

	var raw struct {
		OutletID    *string `json:"outlet_id"`
		ShiftName   string  `json:"shift_name"`
		OpeningCash float64 `json:"opening_cash"`
		Notes       *string `json:"notes,omitempty"`
	}
	if err := json.NewDecoder(r.Body).Decode(&raw); err != nil {
		httpx.Error(w, r, http.StatusBadRequest, "invalid_payload", "format data shift tidak valid")
		return
	}

	var targetOutletID uuid.UUID
	if raw.OutletID != nil && *raw.OutletID != "" && *raw.OutletID != "ALL" {
		parsed, err := uuid.Parse(*raw.OutletID)
		if err != nil {
			httpx.Error(w, r, http.StatusBadRequest, "invalid_outlet", "ID outlet tidak valid. Harap pilih cabang restoran spesifik")
			return
		}
		targetOutletID = parsed
	} else if outletID != nil {
		targetOutletID = *outletID
	}

	if targetOutletID == uuid.Nil {
		httpx.Error(w, r, http.StatusBadRequest, "missing_outlet", "Harap pilih cabang restoran spesifik (Tropical Steak House atau Tropical Garden Resto). Laci kasir tidak dapat dibuka untuk konsolidasi semua resto")
		return
	}
	if !iammw.RequireOutletAccess(r.Context(), targetOutletID) {
		logger.Annotate(r.Context(), "error_code", "outlet_forbidden")
		httpx.Error(w, r, http.StatusForbidden, "forbidden", "anda tidak memiliki akses untuk membuka shift di outlet ini")
		return
	}

	req := domain.OpenShiftRequest{
		OutletID:    targetOutletID,
		ShiftName:   raw.ShiftName,
		OpeningCash: raw.OpeningCash,
		Notes:       raw.Notes,
	}

	username := iammw.UsernameFromContext(r.Context())
	userID, _ := h.posUsecase.GetUserIDByUsername(r.Context(), tenantID, username)

	shift, err := h.posUsecase.OpenShift(r.Context(), tenantID, userID, req)
	if err != nil {
		h.handleError(w, r, err, "gagal membuka shift kasir")
		return
	}
	h.log.InfoContext(r.Context(), "pos_shift_opened",
		"shift_id", shift.ID,
		"shift_number", shift.ShiftNumber,
		"outlet_id", shift.OutletID,
		"opening_cash", shift.OpeningCash,
	)

	httpx.JSON(w, http.StatusCreated, shift)
}

// CloseShift handles POST /api/v1/pos/shifts/{id}/close.
func (h *POSHandler) CloseShift(w http.ResponseWriter, r *http.Request) {
	tenantID, _, ok := h.resolveTenantAndOutlet(r)
	if !ok {
		httpx.Error(w, r, http.StatusUnauthorized, "unauthorized", "otentikasi diperlukan")
		return
	}

	shiftID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpx.Error(w, r, http.StatusBadRequest, "invalid_id", "ID shift tidak valid")
		return
	}

	var req domain.CloseShiftRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpx.Error(w, r, http.StatusBadRequest, "invalid_payload", "format data rekonsiliasi kas tidak valid")
		return
	}

	closedShift, err := h.posUsecase.CloseShift(r.Context(), tenantID, shiftID, req)
	if err != nil {
		h.handleError(w, r, err, "gagal menutup shift kasir")
		return
	}
	h.log.InfoContext(r.Context(), "pos_shift_closed",
		"shift_id", closedShift.ID,
		"shift_number", closedShift.ShiftNumber,
		"outlet_id", closedShift.OutletID,
		"actual_cash", closedShift.ActualCash,
		"cash_difference", closedShift.CashDifference,
	)

	httpx.JSON(w, http.StatusOK, closedShift)
}

// GetXReport handles GET /api/v1/pos/shifts/{id}/x-report.
func (h *POSHandler) GetXReport(w http.ResponseWriter, r *http.Request) {
	tenantID, outletID, ok := h.resolveTenantAndOutlet(r)
	if !ok {
		httpx.Error(w, r, http.StatusUnauthorized, "unauthorized", "otentikasi diperlukan")
		return
	}

	idParam := chi.URLParam(r, "id")
	var shiftID uuid.UUID
	if idParam == "current" {
		if outletID == nil {
			httpx.Error(w, r, http.StatusBadRequest, "missing_outlet", "outlet_id diperlukan")
			return
		}
		curr, err := h.posUsecase.GetCurrentOpenShift(r.Context(), tenantID, *outletID)
		if err != nil || curr == nil {
			httpx.Error(w, r, http.StatusNotFound, "not_found", "tidak ada shift aktif yang terbuka")
			return
		}
		shiftID = curr.ID
	} else {
		parsed, err := uuid.Parse(idParam)
		if err != nil {
			httpx.Error(w, r, http.StatusBadRequest, "invalid_id", "ID shift tidak valid")
			return
		}
		shiftID = parsed
	}

	username := iammw.UsernameFromContext(r.Context())
	report, err := h.posUsecase.GetShiftReport(r.Context(), tenantID, shiftID, "X_REPORT", username)
	if err != nil {
		httpx.Error(w, r, http.StatusInternalServerError, "report_failed", err.Error())
		return
	}

	httpx.JSON(w, http.StatusOK, report)
}

// GetZReport handles GET /api/v1/pos/shifts/{id}/z-report.
func (h *POSHandler) GetZReport(w http.ResponseWriter, r *http.Request) {
	tenantID, _, ok := h.resolveTenantAndOutlet(r)
	if !ok {
		httpx.Error(w, r, http.StatusUnauthorized, "unauthorized", "otentikasi diperlukan")
		return
	}

	shiftID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpx.Error(w, r, http.StatusBadRequest, "invalid_id", "ID shift tidak valid")
		return
	}

	username := iammw.UsernameFromContext(r.Context())
	report, err := h.posUsecase.GetShiftReport(r.Context(), tenantID, shiftID, "Z_REPORT", username)
	if err != nil {
		httpx.Error(w, r, http.StatusInternalServerError, "report_failed", err.Error())
		return
	}

	httpx.JSON(w, http.StatusOK, report)
}

// AddCashMovement handles POST /api/v1/pos/shifts/{id}/cash-movements.
func (h *POSHandler) AddCashMovement(w http.ResponseWriter, r *http.Request) {
	tenantID, _, ok := h.resolveTenantAndOutlet(r)
	if !ok {
		httpx.Error(w, r, http.StatusUnauthorized, "unauthorized", "otentikasi diperlukan")
		return
	}

	shiftID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpx.Error(w, r, http.StatusBadRequest, "invalid_id", "ID shift tidak valid")
		return
	}

	var req domain.CashMovementRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpx.Error(w, r, http.StatusBadRequest, "invalid_payload", "format data mutasi kas tidak valid")
		return
	}

	movement, err := h.posUsecase.AddCashMovement(r.Context(), tenantID, shiftID, req)
	if err != nil {
		httpx.Error(w, r, http.StatusBadRequest, "cash_movement_failed", err.Error())
		return
	}

	httpx.JSON(w, http.StatusCreated, movement)
}

// ListCashMovements handles GET /api/v1/pos/shifts/{id}/cash-movements.
func (h *POSHandler) ListCashMovements(w http.ResponseWriter, r *http.Request) {
	tenantID, _, ok := h.resolveTenantAndOutlet(r)
	if !ok {
		httpx.Error(w, r, http.StatusUnauthorized, "unauthorized", "otentikasi diperlukan")
		return
	}

	shiftID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpx.Error(w, r, http.StatusBadRequest, "invalid_id", "ID shift tidak valid")
		return
	}

	movements, err := h.posUsecase.ListCashMovements(r.Context(), tenantID, shiftID)
	if err != nil {
		httpx.Error(w, r, http.StatusInternalServerError, "internal_error", err.Error())
		return
	}

	httpx.JSON(w, http.StatusOK, movements)
}

// ListShifts handles GET /api/v1/pos/shifts.
func (h *POSHandler) ListShifts(w http.ResponseWriter, r *http.Request) {
	tenantID, outletID, ok := h.resolveTenantAndOutlet(r)
	if !ok {
		httpx.Error(w, r, http.StatusUnauthorized, "unauthorized", "otentikasi diperlukan")
		return
	}

	var status *string
	if s := r.URL.Query().Get("status"); s != "" && s != "ALL" {
		status = &s
	}

	limit := 30
	if l := r.URL.Query().Get("limit"); l != "" {
		if parsed, err := strconv.Atoi(l); err == nil && parsed > 0 {
			limit = parsed
		}
	}

	shifts, err := h.posUsecase.ListShifts(r.Context(), tenantID, outletID, status, limit)
	if err != nil {
		httpx.Error(w, r, http.StatusInternalServerError, "internal_error", err.Error())
		return
	}

	httpx.JSON(w, http.StatusOK, shifts)
}
