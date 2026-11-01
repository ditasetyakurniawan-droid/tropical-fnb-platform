package usecase

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"

	"tropical-fnb/backend/internal/modules/inventory/domain"
	"tropical-fnb/backend/internal/modules/inventory/engine"
	"tropical-fnb/backend/internal/modules/inventory/repository"
)

type Usecase struct {
	repo *repository.InventoryRepo
}

func NewUsecase(repo *repository.InventoryRepo) *Usecase {
	return &Usecase{repo: repo}
}

// ------------------------------------------------------------- Warehouses ---

func (uc *Usecase) ListWarehouses(ctx context.Context, actor domain.Actor, outletID *uuid.UUID) ([]domain.Warehouse, error) {
	return uc.repo.ListWarehouses(ctx, actor.TenantID, outletID)
}

func (uc *Usecase) GetWarehouse(ctx context.Context, actor domain.Actor, id uuid.UUID) (*domain.Warehouse, error) {
	return uc.repo.GetWarehouse(ctx, actor.TenantID, id)
}

type CreateWarehouseInput struct {
	OutletID      uuid.UUID            `json:"outlet_id"`
	Code          string               `json:"code"`
	Name          string               `json:"name"`
	WarehouseType domain.WarehouseType `json:"warehouse_type"`
	Address       *string              `json:"address,omitempty"`
	PicName       *string              `json:"pic_name,omitempty"`
}

type UpdateWarehouseInput struct {
	Name          string               `json:"name"`
	WarehouseType domain.WarehouseType `json:"warehouse_type"`
	Address       *string              `json:"address,omitempty"`
	PicName       *string              `json:"pic_name,omitempty"`
	IsActive      bool                 `json:"is_active"`
}

func (uc *Usecase) CreateWarehouse(ctx context.Context, actor domain.Actor, in CreateWarehouseInput) (*domain.Warehouse, error) {
	if in.OutletID == uuid.Nil {
		return nil, domain.Validation("outlet_id wajib dipilih untuk kepemilikan gudang cabang")
	}
	if in.Code == "" || in.Name == "" {
		return nil, domain.Validation("kode dan nama gudang wajib diisi")
	}
	if in.WarehouseType == "" {
		in.WarehouseType = domain.WhDryStore
	}
	w := domain.Warehouse{
		TenantID:      actor.TenantID,
		OutletID:      &in.OutletID,
		Code:          in.Code,
		Name:          in.Name,
		WarehouseType: in.WarehouseType,
		Address:       in.Address,
		PicName:       in.PicName,
	}
	return uc.repo.CreateWarehouse(ctx, w)
}

func (uc *Usecase) UpdateWarehouse(ctx context.Context, actor domain.Actor, id uuid.UUID, in UpdateWarehouseInput) (*domain.Warehouse, error) {
	if in.Name == "" {
		return nil, domain.Validation("nama gudang wajib diisi")
	}
	return uc.repo.UpdateWarehouse(ctx, actor.TenantID, id, in.Name, in.WarehouseType, in.Address, in.PicName, in.IsActive)
}

func (uc *Usecase) DeleteWarehouse(ctx context.Context, actor domain.Actor, id uuid.UUID) error {
	return uc.repo.DeleteWarehouse(ctx, actor.TenantID, id)
}

// --------------------------------------------------------- Stock Balances ---

func (uc *Usecase) ListStockBalances(ctx context.Context, actor domain.Actor, warehouseID uuid.UUID) ([]domain.StockBalance, error) {
	return uc.repo.ListStockBalances(ctx, actor.TenantID, warehouseID)
}

func (uc *Usecase) ListInventoryItems(ctx context.Context, actor domain.Actor) ([]domain.InventoryItem, error) {
	return uc.repo.ListInventoryItems(ctx, actor.TenantID)
}

// -------------------------------------------------------------- Suppliers ---

func (uc *Usecase) ListSuppliers(ctx context.Context, actor domain.Actor) ([]domain.Supplier, error) {
	return uc.repo.ListSuppliers(ctx, actor.TenantID)
}

type CreateSupplierInput struct {
	Code              string  `json:"code"`
	Name              string  `json:"name"`
	Category          string  `json:"category"`
	ContactPerson     *string `json:"contact_person,omitempty"`
	Phone             *string `json:"phone,omitempty"`
	Email             *string `json:"email,omitempty"`
	Address           *string `json:"address,omitempty"`
	TermOfPaymentDays int     `json:"term_of_payment_days"`
	BankName          *string `json:"bank_name,omitempty"`
	BankAccountNumber *string `json:"bank_account_number,omitempty"`
	BankAccountHolder *string `json:"bank_account_holder,omitempty"`
}

func (uc *Usecase) CreateSupplier(ctx context.Context, actor domain.Actor, in CreateSupplierInput) (*domain.Supplier, error) {
	if in.Code == "" || in.Name == "" {
		return nil, domain.Validation("kode dan nama supplier wajib diisi")
	}
	s := domain.Supplier{
		TenantID:          actor.TenantID,
		Code:              in.Code,
		Name:              in.Name,
		Category:          in.Category,
		ContactPerson:     in.ContactPerson,
		Phone:             in.Phone,
		Email:             in.Email,
		Address:           in.Address,
		TermOfPaymentDays: in.TermOfPaymentDays,
		BankName:          in.BankName,
		BankAccountNumber: in.BankAccountNumber,
		BankAccountHolder: in.BankAccountHolder,
		IsActive:          true,
	}
	return uc.repo.CreateSupplier(ctx, s)
}

// -------------------------------------------------------- Purchase Orders ---

func (uc *Usecase) ListPurchaseOrders(ctx context.Context, actor domain.Actor, warehouseID *uuid.UUID, status *string) ([]domain.PurchaseOrder, error) {
	return uc.repo.ListPurchaseOrders(ctx, actor.TenantID, warehouseID, status)
}

func (uc *Usecase) GetPurchaseOrder(ctx context.Context, actor domain.Actor, id uuid.UUID) (*domain.PurchaseOrder, error) {
	return uc.repo.GetPurchaseOrder(ctx, actor.TenantID, id)
}

type CreatePOItemInput struct {
	ItemID     uuid.UUID `json:"item_id"`
	OrderedQty float64   `json:"ordered_qty"`
	Unit       string    `json:"unit"`
	UnitPrice  float64   `json:"unit_price"`
}

type CreatePOInput struct {
	OutletID             uuid.UUID           `json:"outlet_id"`
	WarehouseID          uuid.UUID           `json:"warehouse_id"`
	SupplierID           uuid.UUID           `json:"supplier_id"`
	OrderDate            string              `json:"order_date"`
	ExpectedDeliveryDate string              `json:"expected_delivery_date"`
	Notes                *string             `json:"notes,omitempty"`
	Items                []CreatePOItemInput `json:"items"`
}

func (uc *Usecase) CreatePurchaseOrder(ctx context.Context, actor domain.Actor, in CreatePOInput) (*domain.PurchaseOrder, error) {
	if len(in.Items) == 0 {
		return nil, domain.Validation("PO harus memiliki minimal 1 item barang")
	}

	poNumber := fmt.Sprintf("PO-%s-%03d", time.Now().Format("20060102"), time.Now().Nanosecond()%1000)
	var subtotal float64
	var items []domain.PurchaseOrderItem

	for _, it := range in.Items {
		if it.OrderedQty <= 0 || it.UnitPrice < 0 {
			return nil, domain.Validation("kuantitas pesanan harus lebih besar dari 0")
		}
		itemSubtotal := it.OrderedQty * it.UnitPrice
		subtotal += itemSubtotal
		items = append(items, domain.PurchaseOrderItem{
			ItemID:     it.ItemID,
			OrderedQty: it.OrderedQty,
			Unit:       it.Unit,
			UnitPrice:  it.UnitPrice,
			Subtotal:   itemSubtotal,
		})
	}

	po := domain.PurchaseOrder{
		TenantID:             actor.TenantID,
		OutletID:             in.OutletID,
		WarehouseID:          in.WarehouseID,
		SupplierID:           in.SupplierID,
		PONumber:             poNumber,
		OrderDate:            in.OrderDate,
		ExpectedDeliveryDate: in.ExpectedDeliveryDate,
		Status:               domain.POSubmitted,
		SubtotalAmount:       subtotal,
		TaxAmount:            0,
		TotalAmount:          subtotal,
		Notes:                in.Notes,
		Items:                items,
	}

	return uc.repo.CreatePurchaseOrder(ctx, po)
}

func (uc *Usecase) CancelPurchaseOrder(ctx context.Context, actor domain.Actor, id uuid.UUID) error {
	return uc.repo.UpdatePOStatus(ctx, actor.TenantID, id, domain.POCancelled)
}

// --------------------------------------------------------- Goods Receipts ---

func (uc *Usecase) ListGoodsReceipts(ctx context.Context, actor domain.Actor, warehouseID *uuid.UUID) ([]domain.GoodsReceipt, error) {
	return uc.repo.ListGoodsReceipts(ctx, actor.TenantID, warehouseID)
}

type CreateGRItemInput struct {
	POItemID        *uuid.UUID `json:"po_item_id,omitempty"`
	ItemID          uuid.UUID  `json:"item_id"`
	BilledQty       float64    `json:"billed_qty"`
	ActualWeightQty float64    `json:"actual_weight_qty"` // Calibrated scale reading
	Unit            string     `json:"unit"`
	UnitCost        float64    `json:"unit_cost"`
	RejectQty       float64    `json:"reject_qty"`
	RejectReason    *string    `json:"reject_reason,omitempty"`
	ExpiryDate      *string    `json:"expiry_date,omitempty"`
	BatchNumber     *string    `json:"batch_number,omitempty"`
}

type CreateGRInput struct {
	PurchaseOrderID *uuid.UUID          `json:"purchase_order_id,omitempty"`
	SupplierID      uuid.UUID           `json:"supplier_id"`
	WarehouseID     uuid.UUID           `json:"warehouse_id"`
	ReceivedDate    string              `json:"received_date"`
	InvoiceNumber   *string             `json:"invoice_number,omitempty"`
	PhotoURL        *string             `json:"photo_url,omitempty"`
	Notes           *string             `json:"notes,omitempty"`
	ReceivedByName  *string             `json:"received_by_name,omitempty"`
	Items           []CreateGRItemInput `json:"items"`
}

func (uc *Usecase) CreateGoodsReceipt(ctx context.Context, actor domain.Actor, in CreateGRInput) (*domain.GoodsReceipt, error) {
	if len(in.Items) == 0 {
		return nil, domain.Validation("penerimaan barang harus memiliki minimal 1 item")
	}

	grNumber := fmt.Sprintf("GR-%s-%03d", time.Now().Format("20060102"), time.Now().Nanosecond()%1000)
	var totalBilled, totalActual float64
	var items []domain.GoodsReceiptItem

	for _, it := range in.Items {
		if it.ActualWeightQty < 0 || it.BilledQty < 0 {
			return nil, domain.Validation("berat timbangan tidak boleh negatif")
		}
		varQty, _ := engine.CalculateWeightVariance(it.BilledQty, it.ActualWeightQty)
		subtotal := it.ActualWeightQty * it.UnitCost
		totalBilled += it.BilledQty * it.UnitCost
		totalActual += subtotal

		items = append(items, domain.GoodsReceiptItem{
			POItemID:          it.POItemID,
			ItemID:            it.ItemID,
			BilledQty:         it.BilledQty,
			ActualWeightQty:   it.ActualWeightQty,
			VarianceWeightQty: varQty,
			Unit:              it.Unit,
			UnitCost:          it.UnitCost,
			SubtotalCost:      subtotal,
			RejectQty:         it.RejectQty,
			RejectReason:      it.RejectReason,
			ExpiryDate:        it.ExpiryDate,
			BatchNumber:       it.BatchNumber,
		})
	}

	receivedDate := strings.TrimSpace(in.ReceivedDate)
	if receivedDate == "" {
		receivedDate = time.Now().Format("2006-01-02")
	}

	gr := domain.GoodsReceipt{
		TenantID:          actor.TenantID,
		ReceiptNumber:     grNumber,
		PurchaseOrderID:   in.PurchaseOrderID,
		SupplierID:        in.SupplierID,
		WarehouseID:       in.WarehouseID,
		ReceivedDate:      receivedDate,
		InvoiceNumber:     in.InvoiceNumber,
		TotalBilledAmount: totalBilled,
		TotalActualAmount: totalActual,
		PhotoURL:          in.PhotoURL,
		Notes:             in.Notes,
		ReceivedByName:    in.ReceivedByName,
		Items:             items,
	}

	return uc.repo.CreateGoodsReceipt(ctx, gr)
}

// -------------------------------------------------------- Stock Transfers ---

func (uc *Usecase) ListStockTransfers(ctx context.Context, actor domain.Actor, outletID, warehouseID *uuid.UUID, status, transferType *string) ([]domain.StockTransfer, error) {
	return uc.repo.ListStockTransfers(ctx, actor.TenantID, outletID, warehouseID, status, transferType)
}

func (uc *Usecase) GetStockTransfer(ctx context.Context, actor domain.Actor, id uuid.UUID) (*domain.StockTransfer, error) {
	return uc.repo.GetStockTransfer(ctx, actor.TenantID, id)
}

type CreateTransferItemInput struct {
	ItemID       uuid.UUID `json:"item_id"`
	RequestedQty float64   `json:"requested_qty"`
	Unit         string    `json:"unit"`
	UnitCost     float64   `json:"unit_cost,omitempty"`
	Notes        *string   `json:"notes,omitempty"`
}

type CreateTransferInput struct {
	OriginWarehouseID uuid.UUID                 `json:"origin_warehouse_id"`
	DestWarehouseID   uuid.UUID                 `json:"destination_warehouse_id"`
	TransferDate      string                    `json:"transfer_date"`
	DispatchedByName  *string                   `json:"dispatched_by_name,omitempty"`
	Notes             *string                   `json:"notes,omitempty"`
	Items             []CreateTransferItemInput `json:"items"`
}

func (uc *Usecase) CreateStockTransfer(ctx context.Context, actor domain.Actor, in CreateTransferInput) (*domain.StockTransfer, error) {
	if in.OriginWarehouseID == in.DestWarehouseID {
		return nil, domain.Validation("gudang asal dan tujuan tidak boleh sama")
	}
	if len(in.Items) == 0 {
		return nil, domain.Validation("surat jalan mutasi harus memiliki minimal 1 item")
	}

	dateStr := time.Now().Format("20060102")
	seq := time.Now().Nanosecond() % 1000
	trfNumber := fmt.Sprintf("TRF-%s-%03d", dateStr, seq)
	waybillNumber := fmt.Sprintf("SJ-%s-%03d", dateStr, seq)

	if in.TransferDate == "" {
		in.TransferDate = time.Now().Format("2006-01-02")
	}

	var items []domain.StockTransferItem
	for _, it := range in.Items {
		if it.RequestedQty <= 0 {
			return nil, domain.Validation("jumlah permintaan mutasi harus lebih besar dari 0")
		}
		items = append(items, domain.StockTransferItem{
			ItemID:       it.ItemID,
			RequestedQty: it.RequestedQty,
			Unit:         it.Unit,
			UnitCost:     it.UnitCost,
			Notes:        it.Notes,
		})
	}

	dispName := in.DispatchedByName
	if dispName == nil || *dispName == "" {
		dispName = &actor.Username
	}

	trf := domain.StockTransfer{
		TenantID:          actor.TenantID,
		TransferNumber:    trfNumber,
		WaybillNumber:     &waybillNumber,
		OriginWarehouseID: in.OriginWarehouseID,
		DestWarehouseID:   in.DestWarehouseID,
		TransferDate:      in.TransferDate,
		DispatchedByName:  dispName,
		Notes:             in.Notes,
		Items:             items,
	}

	return uc.repo.CreateStockTransfer(ctx, trf)
}

type DispatchTransferItemInput struct {
	ItemID        uuid.UUID `json:"item_id"`
	DispatchedQty float64   `json:"dispatched_qty"`
}

type DispatchTransferInput struct {
	DispatchedByName string                      `json:"dispatched_by_name"`
	WaybillNumber    *string                     `json:"waybill_number,omitempty"`
	Items            []DispatchTransferItemInput `json:"items,omitempty"`
}

func (uc *Usecase) DispatchStockTransfer(ctx context.Context, actor domain.Actor, id uuid.UUID, in DispatchTransferInput) (*domain.StockTransfer, error) {
	dispName := in.DispatchedByName
	if dispName == "" {
		dispName = actor.Username
	}

	dispatches := make(map[uuid.UUID]float64)
	for _, it := range in.Items {
		if it.DispatchedQty > 0 {
			dispatches[it.ItemID] = it.DispatchedQty
		}
	}

	return uc.repo.DispatchStockTransfer(ctx, actor.TenantID, id, dispName, in.WaybillNumber, dispatches)
}

type ReceiveTransferItemInput struct {
	ItemID         uuid.UUID `json:"item_id"`
	ReceivedQty    float64   `json:"received_qty"`
	VarianceReason *string   `json:"variance_reason,omitempty"`
	Notes          *string   `json:"notes,omitempty"`
}

type ReceiveTransferInput struct {
	ReceivedByName string                     `json:"received_by_name"`
	Notes          *string                    `json:"notes,omitempty"`
	Items          []ReceiveTransferItemInput `json:"items"`
}

func (uc *Usecase) ReceiveStockTransfer(ctx context.Context, actor domain.Actor, id uuid.UUID, in ReceiveTransferInput) (*domain.StockTransfer, error) {
	recvName := in.ReceivedByName
	if recvName == "" {
		recvName = actor.Username
	}

	var receipts []repository.TransferReceiptItemInput
	for _, it := range in.Items {
		if it.ReceivedQty < 0 {
			return nil, domain.Validation("kuantitas barang yang diterima tidak boleh negatif")
		}
		receipts = append(receipts, repository.TransferReceiptItemInput{
			ItemID:         it.ItemID,
			ReceivedQty:    it.ReceivedQty,
			VarianceReason: it.VarianceReason,
			Notes:          it.Notes,
		})
	}

	return uc.repo.ReceiveStockTransfer(ctx, actor.TenantID, id, recvName, in.Notes, receipts)
}

type CancelTransferInput struct {
	CancellationReason string `json:"cancellation_reason"`
}

func (uc *Usecase) CancelStockTransfer(ctx context.Context, actor domain.Actor, id uuid.UUID, in CancelTransferInput) (*domain.StockTransfer, error) {
	reason := in.CancellationReason
	if reason == "" {
		reason = fmt.Sprintf("Dibatalkan oleh %s", actor.Username)
	}
	return uc.repo.CancelStockTransfer(ctx, actor.TenantID, id, reason)
}

// --------------------------------------------------------- Stock Opnames ----

func (uc *Usecase) ListStockOpnames(ctx context.Context, actor domain.Actor, warehouseID *uuid.UUID) ([]domain.StockOpname, error) {
	return uc.repo.ListStockOpnames(ctx, actor.TenantID, warehouseID)
}

func (uc *Usecase) GetStockOpname(ctx context.Context, actor domain.Actor, id uuid.UUID) (*domain.StockOpname, error) {
	// If caller is NOT an approver / manager, enforce blind stock counting
	isBlindStaff := !actor.HasPerm(domain.PermOpnameApprove)
	return uc.repo.GetStockOpname(ctx, actor.TenantID, id, isBlindStaff)
}

type CreateOpnameInput struct {
	WarehouseID     uuid.UUID `json:"warehouse_id"`
	OpnameDate      string    `json:"opname_date"`
	ConductedByName *string   `json:"conducted_by_name,omitempty"`
	Notes           *string   `json:"notes,omitempty"`
}

func (uc *Usecase) CreateStockOpname(ctx context.Context, actor domain.Actor, in CreateOpnameInput) (*domain.StockOpname, error) {
	opNumber := fmt.Sprintf("SOP-%s-%03d", time.Now().Format("20060102"), time.Now().Nanosecond()%1000)
	so := domain.StockOpname{
		TenantID:        actor.TenantID,
		OpnameNumber:    opNumber,
		WarehouseID:     in.WarehouseID,
		OpnameDate:      in.OpnameDate,
		Status:          domain.OpnameDraft,
		ConductedByName: in.ConductedByName,
		Notes:           in.Notes,
	}
	return uc.repo.CreateStockOpname(ctx, so)
}

type SaveOpnameCountItemInput struct {
	ItemID             uuid.UUID `json:"item_id"`
	PhysicalCountedQty float64   `json:"physical_counted_qty"`
	VarianceCategory   string    `json:"variance_category"`
	Notes              *string   `json:"notes,omitempty"`
}

type SaveOpnameCountInput struct {
	Items []SaveOpnameCountItemInput `json:"items"`
}

func (uc *Usecase) SaveOpnameCount(ctx context.Context, actor domain.Actor, opnameID uuid.UUID, in SaveOpnameCountInput) error {
	var items []domain.StockOpnameItem
	for _, it := range in.Items {
		items = append(items, domain.StockOpnameItem{
			ItemID:             it.ItemID,
			PhysicalCountedQty: it.PhysicalCountedQty,
			VarianceCategory:   it.VarianceCategory,
			Notes:              it.Notes,
		})
	}
	return uc.repo.SaveOpnameCount(ctx, actor.TenantID, opnameID, items)
}

func (uc *Usecase) ApproveStockOpname(ctx context.Context, actor domain.Actor, opnameID uuid.UUID) error {
	if !actor.HasPerm(domain.PermOpnameApprove) {
		return domain.Forbidden("hanya manajer / direksi yang berwenang menyetujui penyesuaian selisih stock opname")
	}
	return uc.repo.ApproveStockOpname(ctx, actor.TenantID, opnameID, actor.Username)
}

// --------------------------------------------------------- Waste Records ----

func (uc *Usecase) ListWasteRecords(ctx context.Context, actor domain.Actor, warehouseID *uuid.UUID) ([]domain.WasteRecord, error) {
	return uc.repo.ListWasteRecords(ctx, actor.TenantID, warehouseID)
}

type CreateWasteItemInput struct {
	ItemID   uuid.UUID `json:"item_id"`
	Quantity float64   `json:"quantity"`
	Unit     string    `json:"unit"`
	UnitCost float64   `json:"unit_cost"`
	Notes    *string   `json:"notes,omitempty"`
}

type CreateWasteInput struct {
	OutletID          uuid.UUID              `json:"outlet_id"`
	WarehouseID       uuid.UUID              `json:"warehouse_id"`
	WasteDate         string                 `json:"waste_date"`
	Category          string                 `json:"category"`
	RecipientDivision *string                `json:"recipient_division,omitempty"`
	PhotoURL          *string                `json:"photo_url,omitempty"`
	RecordedByName    *string                `json:"recorded_by_name,omitempty"`
	Notes             *string                `json:"notes,omitempty"`
	Items             []CreateWasteItemInput `json:"items"`
}

func (uc *Usecase) CreateWasteRecord(ctx context.Context, actor domain.Actor, in CreateWasteInput) (*domain.WasteRecord, error) {
	if len(in.Items) == 0 {
		return nil, domain.Validation("pencatatan waste harus memiliki minimal 1 item")
	}

	wasteNumber := fmt.Sprintf("WST-%s-%03d", time.Now().Format("20060102"), time.Now().Nanosecond()%1000)
	var totalCost float64
	var items []domain.WasteRecordItem

	for _, it := range in.Items {
		if it.Quantity <= 0 {
			return nil, domain.Validation("kuantitas waste harus lebih besar dari 0")
		}
		subtotal := it.Quantity * it.UnitCost
		totalCost += subtotal
		items = append(items, domain.WasteRecordItem{
			ItemID:       it.ItemID,
			Quantity:     it.Quantity,
			Unit:         it.Unit,
			UnitCost:     it.UnitCost,
			SubtotalCost: subtotal,
			Notes:        it.Notes,
		})
	}

	wr := domain.WasteRecord{
		TenantID:          actor.TenantID,
		OutletID:          in.OutletID,
		WarehouseID:       in.WarehouseID,
		WasteNumber:       wasteNumber,
		WasteDate:         in.WasteDate,
		Category:          in.Category,
		RecipientDivision: in.RecipientDivision,
		TotalCost:         totalCost,
		PhotoURL:          in.PhotoURL,
		RecordedByName:    in.RecordedByName,
		Notes:             in.Notes,
		Items:             items,
	}

	return uc.repo.CreateWasteRecord(ctx, wr)
}

// ------------------------------------------------------------- Menu HPA -----

func (uc *Usecase) ListMenuHpa(ctx context.Context, actor domain.Actor, outletID *uuid.UUID) ([]domain.MenuHpaItem, error) {
	return uc.repo.ListMenuHpa(ctx, actor.TenantID, outletID)
}

type UpdateMenuHpaInput struct {
	Mode      string  `json:"hpa_calculation_mode"` // DYNAMIC_BOM vs MANUAL_OVERRIDE
	ManualHpa float64 `json:"manual_hpa"`
}

func (uc *Usecase) UpdateMenuHpaMode(ctx context.Context, actor domain.Actor, menuItemId uuid.UUID, in UpdateMenuHpaInput) error {
	if in.Mode != "DYNAMIC_BOM" && in.Mode != "MANUAL_OVERRIDE" {
		return domain.Validation("mode kalkulasi HPA harus DYNAMIC_BOM atau MANUAL_OVERRIDE")
	}
	if in.Mode == "MANUAL_OVERRIDE" && in.ManualHpa < 0 {
		return domain.Validation("target HPA manual tidak boleh negatif")
	}
	return uc.repo.UpdateMenuHpaMode(ctx, actor.TenantID, menuItemId, in.Mode, in.ManualHpa)
}
