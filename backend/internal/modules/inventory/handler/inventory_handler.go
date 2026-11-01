package handler

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	iammw "tropical-fnb/backend/internal/modules/iam/middleware"
	"tropical-fnb/backend/internal/modules/inventory/domain"
	"tropical-fnb/backend/internal/modules/inventory/usecase"
	"tropical-fnb/backend/internal/platform/httpx"
)

const maxBodyBytes = 1 << 20 // 1MB

type InventoryHandler struct {
	uc  *usecase.Usecase
	log *slog.Logger
}

func NewInventoryHandler(uc *usecase.Usecase, log *slog.Logger) *InventoryHandler {
	return &InventoryHandler{uc: uc, log: log}
}

func (h *InventoryHandler) actor(w http.ResponseWriter, r *http.Request) (domain.Actor, bool) {
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
			perms[domain.PermWarehouseView] = struct{}{}
			perms[domain.PermWarehouseManage] = struct{}{}
			perms[domain.PermPOManage] = struct{}{}
			perms[domain.PermReceivingManage] = struct{}{}
			perms[domain.PermTransferManage] = struct{}{}
			perms[domain.PermOpnameConduct] = struct{}{}
			perms[domain.PermOpnameApprove] = struct{}{}
			perms[domain.PermWasteManage] = struct{}{}
		} else if role == "HEAD_CHEF" || role == "KITCHEN_CHEF" {
			perms[domain.PermWarehouseView] = struct{}{}
			perms[domain.PermReceivingManage] = struct{}{}
			perms[domain.PermTransferManage] = struct{}{}
			perms[domain.PermOpnameConduct] = struct{}{}
			perms[domain.PermWasteManage] = struct{}{}
		} else if role == "SUPERVISOR" {
			perms[domain.PermWarehouseView] = struct{}{}
			perms[domain.PermReceivingManage] = struct{}{}
			perms[domain.PermTransferManage] = struct{}{}
			perms[domain.PermOpnameConduct] = struct{}{}
			perms[domain.PermWasteManage] = struct{}{}
		}
	}
	return domain.Actor{
		TenantID:    tenantID,
		Username:    username,
		Roles:       roles,
		Permissions: perms,
	}, true
}

func (h *InventoryHandler) fail(w http.ResponseWriter, r *http.Request, err error) {
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
	h.log.Error("inventory request failed", "path", r.URL.Path, "error", err)
	httpx.Error(w, r, http.StatusInternalServerError, "internal_error", "terjadi kesalahan internal pada server")
}

func decode(w http.ResponseWriter, r *http.Request, dst any) bool {
	r.Body = http.MaxBytesReader(w, r.Body, maxBodyBytes)
	if err := json.NewDecoder(r.Body).Decode(dst); err != nil {
		httpx.Error(w, r, http.StatusBadRequest, "invalid_body", "isi permintaan bukan format JSON yang valid")
		return false
	}
	return true
}

// ------------------------------------------------------------- Warehouses ---

func (h *InventoryHandler) ListWarehouses(w http.ResponseWriter, r *http.Request) {
	actor, ok := h.actor(w, r)
	if !ok {
		return
	}
	var outletID *uuid.UUID
	if q := r.URL.Query().Get("outlet_id"); q != "" && q != "ALL" {
		if id, err := uuid.Parse(q); err == nil {
			outletID = &id
		}
	}
	warehouses, err := h.uc.ListWarehouses(r.Context(), actor, outletID)
	if err != nil {
		h.fail(w, r, err)
		return
	}
	httpx.JSON(w, http.StatusOK, httpx.NewListResponse(warehouses))
}

func (h *InventoryHandler) GetWarehouse(w http.ResponseWriter, r *http.Request) {
	actor, ok := h.actor(w, r)
	if !ok {
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpx.Error(w, r, http.StatusUnprocessableEntity, "validation_error", "ID gudang tidak valid")
		return
	}
	wh, err := h.uc.GetWarehouse(r.Context(), actor, id)
	if err != nil {
		h.fail(w, r, err)
		return
	}
	httpx.JSON(w, http.StatusOK, wh)
}

func (h *InventoryHandler) CreateWarehouse(w http.ResponseWriter, r *http.Request) {
	actor, ok := h.actor(w, r)
	if !ok {
		return
	}
	var in usecase.CreateWarehouseInput
	if !decode(w, r, &in) {
		return
	}
	wh, err := h.uc.CreateWarehouse(r.Context(), actor, in)
	if err != nil {
		h.fail(w, r, err)
		return
	}
	httpx.JSON(w, http.StatusCreated, wh)
}

func (h *InventoryHandler) UpdateWarehouse(w http.ResponseWriter, r *http.Request) {
	actor, ok := h.actor(w, r)
	if !ok {
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpx.Error(w, r, http.StatusUnprocessableEntity, "validation_error", "ID gudang tidak valid")
		return
	}
	var in usecase.UpdateWarehouseInput
	if !decode(w, r, &in) {
		return
	}
	wh, err := h.uc.UpdateWarehouse(r.Context(), actor, id, in)
	if err != nil {
		h.fail(w, r, err)
		return
	}
	httpx.JSON(w, http.StatusOK, wh)
}

func (h *InventoryHandler) DeleteWarehouse(w http.ResponseWriter, r *http.Request) {
	actor, ok := h.actor(w, r)
	if !ok {
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpx.Error(w, r, http.StatusUnprocessableEntity, "validation_error", "ID gudang tidak valid")
		return
	}
	if err := h.uc.DeleteWarehouse(r.Context(), actor, id); err != nil {
		h.fail(w, r, err)
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]string{"message": "Gudang berhasil dihapus"})
}

func (h *InventoryHandler) ListStockBalances(w http.ResponseWriter, r *http.Request) {
	actor, ok := h.actor(w, r)
	if !ok {
		return
	}
	whID, err := uuid.Parse(r.URL.Query().Get("warehouse_id"))
	if err != nil {
		httpx.Error(w, r, http.StatusUnprocessableEntity, "validation_error", "parameter warehouse_id wajib diisi")
		return
	}
	balances, err := h.uc.ListStockBalances(r.Context(), actor, whID)
	if err != nil {
		h.fail(w, r, err)
		return
	}
	httpx.JSON(w, http.StatusOK, httpx.NewListResponse(balances))
}

func (h *InventoryHandler) ListInventoryItems(w http.ResponseWriter, r *http.Request) {
	actor, ok := h.actor(w, r)
	if !ok {
		return
	}
	items, err := h.uc.ListInventoryItems(r.Context(), actor)
	if err != nil {
		h.fail(w, r, err)
		return
	}
	httpx.JSON(w, http.StatusOK, httpx.NewListResponse(items))
}

// -------------------------------------------------------------- Suppliers ---

func (h *InventoryHandler) ListSuppliers(w http.ResponseWriter, r *http.Request) {
	actor, ok := h.actor(w, r)
	if !ok {
		return
	}
	suppliers, err := h.uc.ListSuppliers(r.Context(), actor)
	if err != nil {
		h.fail(w, r, err)
		return
	}
	httpx.JSON(w, http.StatusOK, httpx.NewListResponse(suppliers))
}

func (h *InventoryHandler) CreateSupplier(w http.ResponseWriter, r *http.Request) {
	actor, ok := h.actor(w, r)
	if !ok {
		return
	}
	var in usecase.CreateSupplierInput
	if !decode(w, r, &in) {
		return
	}
	s, err := h.uc.CreateSupplier(r.Context(), actor, in)
	if err != nil {
		h.fail(w, r, err)
		return
	}
	httpx.JSON(w, http.StatusCreated, s)
}

// -------------------------------------------------------- Purchase Orders ---

func (h *InventoryHandler) ListPurchaseOrders(w http.ResponseWriter, r *http.Request) {
	actor, ok := h.actor(w, r)
	if !ok {
		return
	}
	var whID *uuid.UUID
	if q := r.URL.Query().Get("warehouse_id"); q != "" && q != "ALL" {
		if id, err := uuid.Parse(q); err == nil {
			whID = &id
		}
	}
	var status *string
	if q := r.URL.Query().Get("status"); q != "" && q != "ALL" {
		status = &q
	}
	orders, err := h.uc.ListPurchaseOrders(r.Context(), actor, whID, status)
	if err != nil {
		h.fail(w, r, err)
		return
	}
	httpx.JSON(w, http.StatusOK, httpx.NewListResponse(orders))
}

func (h *InventoryHandler) GetPurchaseOrder(w http.ResponseWriter, r *http.Request) {
	actor, ok := h.actor(w, r)
	if !ok {
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpx.Error(w, r, http.StatusUnprocessableEntity, "validation_error", "ID PO tidak valid")
		return
	}
	po, err := h.uc.GetPurchaseOrder(r.Context(), actor, id)
	if err != nil {
		h.fail(w, r, err)
		return
	}
	httpx.JSON(w, http.StatusOK, po)
}

func (h *InventoryHandler) CreatePurchaseOrder(w http.ResponseWriter, r *http.Request) {
	actor, ok := h.actor(w, r)
	if !ok {
		return
	}
	var in usecase.CreatePOInput
	if !decode(w, r, &in) {
		return
	}
	po, err := h.uc.CreatePurchaseOrder(r.Context(), actor, in)
	if err != nil {
		h.fail(w, r, err)
		return
	}
	httpx.JSON(w, http.StatusCreated, po)
}

func (h *InventoryHandler) CancelPurchaseOrder(w http.ResponseWriter, r *http.Request) {
	actor, ok := h.actor(w, r)
	if !ok {
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpx.Error(w, r, http.StatusUnprocessableEntity, "validation_error", "ID PO tidak valid")
		return
	}
	if err := h.uc.CancelPurchaseOrder(r.Context(), actor, id); err != nil {
		h.fail(w, r, err)
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]string{"message": "Purchase Order berhasil dibatalkan"})
}

// --------------------------------------------------------- Goods Receipts ---

func (h *InventoryHandler) ListGoodsReceipts(w http.ResponseWriter, r *http.Request) {
	actor, ok := h.actor(w, r)
	if !ok {
		return
	}
	var whID *uuid.UUID
	if q := r.URL.Query().Get("warehouse_id"); q != "" && q != "ALL" {
		if id, err := uuid.Parse(q); err == nil {
			whID = &id
		}
	}
	receipts, err := h.uc.ListGoodsReceipts(r.Context(), actor, whID)
	if err != nil {
		h.fail(w, r, err)
		return
	}
	httpx.JSON(w, http.StatusOK, httpx.NewListResponse(receipts))
}

func (h *InventoryHandler) CreateGoodsReceipt(w http.ResponseWriter, r *http.Request) {
	actor, ok := h.actor(w, r)
	if !ok {
		return
	}
	var in usecase.CreateGRInput
	if !decode(w, r, &in) {
		return
	}
	gr, err := h.uc.CreateGoodsReceipt(r.Context(), actor, in)
	if err != nil {
		h.fail(w, r, err)
		return
	}
	httpx.JSON(w, http.StatusCreated, gr)
}

// -------------------------------------------------------- Stock Transfers ---

func (h *InventoryHandler) ListStockTransfers(w http.ResponseWriter, r *http.Request) {
	actor, ok := h.actor(w, r)
	if !ok {
		return
	}
	var outletID *uuid.UUID
	if q := r.URL.Query().Get("outlet_id"); q != "" && q != "ALL" {
		if id, err := uuid.Parse(q); err == nil {
			outletID = &id
		}
	}
	var whID *uuid.UUID
	if q := r.URL.Query().Get("warehouse_id"); q != "" && q != "ALL" {
		if id, err := uuid.Parse(q); err == nil {
			whID = &id
		}
	}
	var status *string
	if q := r.URL.Query().Get("status"); q != "" && q != "ALL" {
		status = &q
	}
	var trfType *string
	if q := r.URL.Query().Get("transfer_type"); q != "" && q != "ALL" {
		trfType = &q
	}

	transfers, err := h.uc.ListStockTransfers(r.Context(), actor, outletID, whID, status, trfType)
	if err != nil {
		h.fail(w, r, err)
		return
	}
	httpx.JSON(w, http.StatusOK, httpx.NewListResponse(transfers))
}

func (h *InventoryHandler) GetStockTransfer(w http.ResponseWriter, r *http.Request) {
	actor, ok := h.actor(w, r)
	if !ok {
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpx.Error(w, r, http.StatusUnprocessableEntity, "validation_error", "ID transfer tidak valid")
		return
	}
	trf, err := h.uc.GetStockTransfer(r.Context(), actor, id)
	if err != nil {
		h.fail(w, r, err)
		return
	}
	httpx.JSON(w, http.StatusOK, trf)
}

func (h *InventoryHandler) CreateStockTransfer(w http.ResponseWriter, r *http.Request) {
	actor, ok := h.actor(w, r)
	if !ok {
		return
	}
	var in usecase.CreateTransferInput
	if !decode(w, r, &in) {
		return
	}
	trf, err := h.uc.CreateStockTransfer(r.Context(), actor, in)
	if err != nil {
		h.fail(w, r, err)
		return
	}
	httpx.JSON(w, http.StatusCreated, trf)
}

func (h *InventoryHandler) DispatchStockTransfer(w http.ResponseWriter, r *http.Request) {
	actor, ok := h.actor(w, r)
	if !ok {
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpx.Error(w, r, http.StatusUnprocessableEntity, "validation_error", "ID transfer tidak valid")
		return
	}
	var in usecase.DispatchTransferInput
	_ = json.NewDecoder(r.Body).Decode(&in)

	trf, err := h.uc.DispatchStockTransfer(r.Context(), actor, id, in)
	if err != nil {
		h.fail(w, r, err)
		return
	}
	httpx.JSON(w, http.StatusOK, trf)
}

func (h *InventoryHandler) ReceiveStockTransfer(w http.ResponseWriter, r *http.Request) {
	actor, ok := h.actor(w, r)
	if !ok {
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpx.Error(w, r, http.StatusUnprocessableEntity, "validation_error", "ID transfer tidak valid")
		return
	}
	var in usecase.ReceiveTransferInput
	if !decode(w, r, &in) {
		return
	}

	trf, err := h.uc.ReceiveStockTransfer(r.Context(), actor, id, in)
	if err != nil {
		h.fail(w, r, err)
		return
	}
	httpx.JSON(w, http.StatusOK, trf)
}

func (h *InventoryHandler) CancelStockTransfer(w http.ResponseWriter, r *http.Request) {
	actor, ok := h.actor(w, r)
	if !ok {
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpx.Error(w, r, http.StatusUnprocessableEntity, "validation_error", "ID transfer tidak valid")
		return
	}
	var in usecase.CancelTransferInput
	_ = json.NewDecoder(r.Body).Decode(&in)

	trf, err := h.uc.CancelStockTransfer(r.Context(), actor, id, in)
	if err != nil {
		h.fail(w, r, err)
		return
	}
	httpx.JSON(w, http.StatusOK, trf)
}

// --------------------------------------------------------- Stock Opnames ----

func (h *InventoryHandler) ListStockOpnames(w http.ResponseWriter, r *http.Request) {
	actor, ok := h.actor(w, r)
	if !ok {
		return
	}
	var whID *uuid.UUID
	if q := r.URL.Query().Get("warehouse_id"); q != "" && q != "ALL" {
		if id, err := uuid.Parse(q); err == nil {
			whID = &id
		}
	}
	opnames, err := h.uc.ListStockOpnames(r.Context(), actor, whID)
	if err != nil {
		h.fail(w, r, err)
		return
	}
	httpx.JSON(w, http.StatusOK, httpx.NewListResponse(opnames))
}

func (h *InventoryHandler) GetStockOpname(w http.ResponseWriter, r *http.Request) {
	actor, ok := h.actor(w, r)
	if !ok {
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpx.Error(w, r, http.StatusUnprocessableEntity, "validation_error", "ID opname tidak valid")
		return
	}
	so, err := h.uc.GetStockOpname(r.Context(), actor, id)
	if err != nil {
		h.fail(w, r, err)
		return
	}
	httpx.JSON(w, http.StatusOK, so)
}

func (h *InventoryHandler) CreateStockOpname(w http.ResponseWriter, r *http.Request) {
	actor, ok := h.actor(w, r)
	if !ok {
		return
	}
	var in usecase.CreateOpnameInput
	if !decode(w, r, &in) {
		return
	}
	so, err := h.uc.CreateStockOpname(r.Context(), actor, in)
	if err != nil {
		h.fail(w, r, err)
		return
	}
	httpx.JSON(w, http.StatusCreated, so)
}

func (h *InventoryHandler) SaveOpnameCount(w http.ResponseWriter, r *http.Request) {
	actor, ok := h.actor(w, r)
	if !ok {
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpx.Error(w, r, http.StatusUnprocessableEntity, "validation_error", "ID opname tidak valid")
		return
	}
	var in usecase.SaveOpnameCountInput
	if !decode(w, r, &in) {
		return
	}
	if err := h.uc.SaveOpnameCount(r.Context(), actor, id, in); err != nil {
		h.fail(w, r, err)
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]string{"message": "Hitungan fisik stock opname berhasil disimpan"})
}

func (h *InventoryHandler) ApproveStockOpname(w http.ResponseWriter, r *http.Request) {
	actor, ok := h.actor(w, r)
	if !ok {
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpx.Error(w, r, http.StatusUnprocessableEntity, "validation_error", "ID opname tidak valid")
		return
	}
	if err := h.uc.ApproveStockOpname(r.Context(), actor, id); err != nil {
		h.fail(w, r, err)
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]string{"message": "Stock Opname berhasil disetujui dan saldo stok gudang telah disesuaikan"})
}

// --------------------------------------------------------- Waste Records ----

func (h *InventoryHandler) ListWasteRecords(w http.ResponseWriter, r *http.Request) {
	actor, ok := h.actor(w, r)
	if !ok {
		return
	}
	var whID *uuid.UUID
	if q := r.URL.Query().Get("warehouse_id"); q != "" && q != "ALL" {
		if id, err := uuid.Parse(q); err == nil {
			whID = &id
		}
	}
	records, err := h.uc.ListWasteRecords(r.Context(), actor, whID)
	if err != nil {
		h.fail(w, r, err)
		return
	}
	httpx.JSON(w, http.StatusOK, httpx.NewListResponse(records))
}

func (h *InventoryHandler) CreateWasteRecord(w http.ResponseWriter, r *http.Request) {
	actor, ok := h.actor(w, r)
	if !ok {
		return
	}
	var in usecase.CreateWasteInput
	if !decode(w, r, &in) {
		return
	}
	wr, err := h.uc.CreateWasteRecord(r.Context(), actor, in)
	if err != nil {
		h.fail(w, r, err)
		return
	}
	httpx.JSON(w, http.StatusCreated, wr)
}

// ------------------------------------------------------------- Menu HPA -----

func (h *InventoryHandler) ListMenuHpa(w http.ResponseWriter, r *http.Request) {
	actor, ok := h.actor(w, r)
	if !ok {
		return
	}
	var outletID *uuid.UUID
	if q := r.URL.Query().Get("outlet_id"); q != "" && q != "ALL" {
		if id, err := uuid.Parse(q); err == nil {
			outletID = &id
		}
	}
	items, err := h.uc.ListMenuHpa(r.Context(), actor, outletID)
	if err != nil {
		h.fail(w, r, err)
		return
	}
	httpx.JSON(w, http.StatusOK, httpx.NewListResponse(items))
}

func (h *InventoryHandler) UpdateMenuHpaMode(w http.ResponseWriter, r *http.Request) {
	actor, ok := h.actor(w, r)
	if !ok {
		return
	}
	menuItemID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpx.Error(w, r, http.StatusUnprocessableEntity, "validation_error", "ID menu tidak valid")
		return
	}
	var in usecase.UpdateMenuHpaInput
	if !decode(w, r, &in) {
		return
	}
	if err := h.uc.UpdateMenuHpaMode(r.Context(), actor, menuItemID, in); err != nil {
		h.fail(w, r, err)
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]string{"message": "Mode kalkulasi dan target HPA menu berhasil diperbarui"})
}
