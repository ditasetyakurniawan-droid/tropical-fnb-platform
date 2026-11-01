package domain

import (
	"time"

	"github.com/google/uuid"
)

// Permission codes registered for the inventory & procurement module.
const (
	PermWarehouseView   = "inventory.warehouse.view"
	PermWarehouseManage = "inventory.warehouse.manage"
	PermPOManage        = "procurement.po.manage"
	PermReceivingManage = "procurement.receiving.manage"
	PermTransferManage  = "inventory.transfer.manage"
	PermOpnameConduct   = "inventory.opname.conduct"
	PermOpnameApprove   = "inventory.opname.approve"
	PermWasteManage     = "inventory.waste.manage"
)

// WarehouseType defines storage categories.
type WarehouseType string

const (
	WhCentralKitchen WarehouseType = "CENTRAL_KITCHEN"
	WhChiller        WarehouseType = "CHILLER"
	WhFreezer        WarehouseType = "FREEZER"
	WhDryStore       WarehouseType = "DRY_STORE"
	WhOutletStorage  WarehouseType = "OUTLET_STORAGE"
)

// Warehouse represents a distinct inventory storage location.
type Warehouse struct {
	ID            uuid.UUID     `json:"id"`
	TenantID      uuid.UUID     `json:"tenant_id"`
	OutletID      *uuid.UUID    `json:"outlet_id,omitempty"`
	OutletCode    *string       `json:"outlet_code,omitempty"`
	OutletName    *string       `json:"outlet_name,omitempty"`
	Code          string        `json:"code"`
	Name          string        `json:"name"`
	WarehouseType WarehouseType `json:"warehouse_type"`
	Address       *string       `json:"address,omitempty"`
	PicName       *string       `json:"pic_name,omitempty"`
	IsActive      bool          `json:"is_active"`
	ItemCount     int           `json:"item_count"`
	TotalStockVal float64       `json:"total_stock_value"`
	CreatedAt     time.Time     `json:"created_at"`
	UpdatedAt     time.Time     `json:"updated_at"`
}

// StockBalance represents an item balance within a specific warehouse.
type StockBalance struct {
	ID                uuid.UUID  `json:"id"`
	TenantID          uuid.UUID  `json:"tenant_id"`
	WarehouseID       uuid.UUID  `json:"warehouse_id"`
	WarehouseCode     string     `json:"warehouse_code"`
	WarehouseName     string     `json:"warehouse_name"`
	ItemID            uuid.UUID  `json:"item_id"`
	ItemCode          string     `json:"item_code"`
	ItemName          string     `json:"item_name"`
	CategoryName      string     `json:"category_name"`
	Unit              string     `json:"unit"`
	StorageType       string     `json:"storage_type"`
	CostPrice         float64    `json:"cost_price"` // Moving Average Cost
	Quantity          float64    `json:"quantity"`
	ReservedQuantity  float64    `json:"reserved_quantity"`
	AvailableQuantity float64    `json:"available_quantity"`
	MinStockAlert     float64    `json:"min_stock_alert"`
	MaxStockCapacity  float64    `json:"max_stock_capacity"`
	StockStatus       string     `json:"stock_status"` // OK, LOW_STOCK, OUT_OF_STOCK
	TotalValue        float64    `json:"total_value"`  // quantity * cost_price
	LastCountedAt     *time.Time `json:"last_counted_at,omitempty"`
	UpdatedAt         time.Time  `json:"updated_at"`
}

// InventoryItem represents a master raw ingredient or supply.
type InventoryItem struct {
	ID            uuid.UUID `json:"id"`
	TenantID      uuid.UUID `json:"tenant_id"`
	CategoryID    uuid.UUID `json:"category_id"`
	CategoryName  string    `json:"category_name"`
	Code          string    `json:"code"`
	Name          string    `json:"name"`
	Unit          string    `json:"unit"`
	StorageType   string    `json:"storage_type"`
	CostPrice     float64   `json:"cost_price"`
	CurrentStock  float64   `json:"current_stock"`
	MinStockAlert float64   `json:"min_stock_alert"`
	IsActive      bool      `json:"is_active"`
}

// Supplier represents an approved raw material / food supplier.
type Supplier struct {
	ID                uuid.UUID `json:"id"`
	TenantID          uuid.UUID `json:"tenant_id"`
	Code              string    `json:"code"`
	Name              string    `json:"name"`
	Category          string    `json:"category"`
	ContactPerson     *string   `json:"contact_person,omitempty"`
	Phone             *string   `json:"phone,omitempty"`
	Email             *string   `json:"email,omitempty"`
	Address           *string   `json:"address,omitempty"`
	TermOfPaymentDays int       `json:"term_of_payment_days"`
	BankName          *string   `json:"bank_name,omitempty"`
	BankAccountNumber *string   `json:"bank_account_number,omitempty"`
	BankAccountHolder *string   `json:"bank_account_holder,omitempty"`
	IsActive          bool      `json:"is_active"`
	CreatedAt         time.Time `json:"created_at"`
	UpdatedAt         time.Time `json:"updated_at"`
}

// PurchaseOrderStatus enum.
type PurchaseOrderStatus string

const (
	PODraft             PurchaseOrderStatus = "DRAFT"
	POSubmitted         PurchaseOrderStatus = "SUBMITTED"
	POPartiallyReceived PurchaseOrderStatus = "PARTIALLY_RECEIVED"
	POReceived          PurchaseOrderStatus = "RECEIVED"
	POCancelled         PurchaseOrderStatus = "CANCELLED"
)

// PurchaseOrder represents a procurement order sent to a supplier.
type PurchaseOrder struct {
	ID                   uuid.UUID           `json:"id"`
	TenantID             uuid.UUID           `json:"tenant_id"`
	OutletID             uuid.UUID           `json:"outlet_id"`
	OutletName           string              `json:"outlet_name"`
	WarehouseID          uuid.UUID           `json:"warehouse_id"`
	WarehouseName        string              `json:"warehouse_name"`
	SupplierID           uuid.UUID           `json:"supplier_id"`
	SupplierName         string              `json:"supplier_name"`
	PONumber             string              `json:"po_number"`
	OrderDate            string              `json:"order_date"`
	ExpectedDeliveryDate string              `json:"expected_delivery_date"`
	Status               PurchaseOrderStatus `json:"status"`
	SubtotalAmount       float64             `json:"subtotal_amount"`
	TaxAmount            float64             `json:"tax_amount"`
	TotalAmount          float64             `json:"total_amount"`
	Notes                *string             `json:"notes,omitempty"`
	Items                []PurchaseOrderItem `json:"items,omitempty"`
	CreatedAt            time.Time           `json:"created_at"`
	UpdatedAt            time.Time           `json:"updated_at"`
}

type PurchaseOrderItem struct {
	ID              uuid.UUID `json:"id"`
	PurchaseOrderID uuid.UUID `json:"purchase_order_id"`
	ItemID          uuid.UUID `json:"item_id"`
	ItemCode        string    `json:"item_code"`
	ItemName        string    `json:"item_name"`
	OrderedQty      float64   `json:"ordered_qty"`
	Unit            string    `json:"unit"`
	UnitPrice       float64   `json:"unit_price"`
	Subtotal        float64   `json:"subtotal"`
	ReceivedQty     float64   `json:"received_qty"`
}

// GoodsReceipt represents delivery inspection with actual calibrated scale weighing.
type GoodsReceipt struct {
	ID                uuid.UUID          `json:"id"`
	TenantID          uuid.UUID          `json:"tenant_id"`
	ReceiptNumber     string             `json:"receipt_number"`
	PurchaseOrderID   *uuid.UUID         `json:"purchase_order_id,omitempty"`
	PONumber          *string            `json:"po_number,omitempty"`
	SupplierID        uuid.UUID          `json:"supplier_id"`
	SupplierName      string             `json:"supplier_name"`
	WarehouseID       uuid.UUID          `json:"warehouse_id"`
	WarehouseName     string             `json:"warehouse_name"`
	ReceivedDate      string             `json:"received_date"`
	ReceivedTime      time.Time          `json:"received_time"`
	InvoiceNumber     *string            `json:"invoice_number,omitempty"`
	TotalBilledAmount float64            `json:"total_billed_amount"`
	TotalActualAmount float64            `json:"total_actual_amount"`
	PhotoURL          *string            `json:"photo_url,omitempty"`
	Notes             *string            `json:"notes,omitempty"`
	ReceivedByName    *string            `json:"received_by_name,omitempty"`
	Items             []GoodsReceiptItem `json:"items,omitempty"`
	CreatedAt         time.Time          `json:"created_at"`
	UpdatedAt         time.Time          `json:"updated_at"`
}

type GoodsReceiptItem struct {
	ID                uuid.UUID  `json:"id"`
	GoodsReceiptID    uuid.UUID  `json:"goods_receipt_id"`
	POItemID          *uuid.UUID `json:"po_item_id,omitempty"`
	ItemID            uuid.UUID  `json:"item_id"`
	ItemCode          string     `json:"item_code"`
	ItemName          string     `json:"item_name"`
	BilledQty         float64    `json:"billed_qty"`
	ActualWeightQty   float64    `json:"actual_weight_qty"`   // Measured on scale
	VarianceWeightQty float64    `json:"variance_weight_qty"` // Actual - Billed
	Unit              string     `json:"unit"`
	UnitCost          float64    `json:"unit_cost"`
	SubtotalCost      float64    `json:"subtotal_cost"`
	RejectQty         float64    `json:"reject_qty"`
	RejectReason      *string    `json:"reject_reason,omitempty"`
	ExpiryDate        *string    `json:"expiry_date,omitempty"`
	BatchNumber       *string    `json:"batch_number,omitempty"`
}

// StockTransferStatus enum.
type StockTransferStatus string

const (
	TransferPending   StockTransferStatus = "PENDING"
	TransferInTransit StockTransferStatus = "IN_TRANSIT"
	TransferReceived  StockTransferStatus = "RECEIVED"
	TransferCancelled StockTransferStatus = "CANCELLED"
)

// StockTransferType distinguishes peer-to-peer inter-branch vs internal intra-branch transfers.
type StockTransferType string

const (
	TransferInterBranch StockTransferType = "INTER_BRANCH"
	TransferIntraBranch StockTransferType = "INTRA_BRANCH"
)

// StockTransfer represents peer-to-peer inter-branch or intra-branch stock mutation.
type StockTransfer struct {
	ID                  uuid.UUID           `json:"id"`
	TenantID            uuid.UUID           `json:"tenant_id"`
	TransferNumber      string              `json:"transfer_number"`
	WaybillNumber       *string             `json:"waybill_number,omitempty"`
	OriginOutletID      uuid.UUID           `json:"origin_outlet_id"`
	OriginOutletCode    string              `json:"origin_outlet_code"`
	OriginOutletName    string              `json:"origin_outlet_name"`
	OriginWarehouseID   uuid.UUID           `json:"origin_warehouse_id"`
	OriginWarehouseName string              `json:"origin_warehouse_name"`
	DestOutletID        uuid.UUID           `json:"destination_outlet_id"`
	DestOutletCode      string              `json:"destination_outlet_code"`
	DestOutletName      string              `json:"destination_outlet_name"`
	DestWarehouseID     uuid.UUID           `json:"destination_warehouse_id"`
	DestWarehouseName   string              `json:"destination_warehouse_name"`
	TransferDate        string              `json:"transfer_date"`
	TransferType        StockTransferType   `json:"transfer_type"`
	Status              StockTransferStatus `json:"status"`
	DispatchedByName    *string             `json:"dispatched_by_name,omitempty"`
	DispatchedAt        *time.Time          `json:"dispatched_at,omitempty"`
	ReceivedByName      *string             `json:"received_by_name,omitempty"`
	ReceivedAt          *time.Time          `json:"received_at,omitempty"`
	CancelledAt         *time.Time          `json:"cancelled_at,omitempty"`
	CancellationReason  *string             `json:"cancellation_reason,omitempty"`
	Notes               *string             `json:"notes,omitempty"`
	TotalItems          int                 `json:"total_items"`
	TotalVarianceQty    float64             `json:"total_variance_qty"`
	Items               []StockTransferItem `json:"items,omitempty"`
	CreatedAt           time.Time           `json:"created_at"`
	UpdatedAt           time.Time           `json:"updated_at"`
}

type StockTransferItem struct {
	ID             uuid.UUID `json:"id"`
	TransferID     uuid.UUID `json:"transfer_id"`
	ItemID         uuid.UUID `json:"item_id"`
	ItemCode       string    `json:"item_code"`
	ItemName       string    `json:"item_name"`
	RequestedQty   float64   `json:"requested_qty"`
	DispatchedQty  float64   `json:"dispatched_qty"`
	ReceivedQty    float64   `json:"received_qty"`
	VarianceQty    float64   `json:"variance_qty"`
	VarianceReason *string   `json:"variance_reason,omitempty"`
	Unit           string    `json:"unit"`
	UnitCost       float64   `json:"unit_cost"`
	Notes          *string   `json:"notes,omitempty"`
}

// StockOpnameStatus enum.
type StockOpnameStatus string

const (
	OpnameDraft     StockOpnameStatus = "DRAFT"
	OpnameCounted   StockOpnameStatus = "COUNTED"
	OpnameApproved  StockOpnameStatus = "APPROVED"
	OpnameCancelled StockOpnameStatus = "CANCELLED"
)

// StockOpname represents a blind stock inventory count session.
type StockOpname struct {
	ID                uuid.UUID         `json:"id"`
	TenantID          uuid.UUID         `json:"tenant_id"`
	OpnameNumber      string            `json:"opname_number"`
	WarehouseID       uuid.UUID         `json:"warehouse_id"`
	WarehouseName     string            `json:"warehouse_name"`
	OpnameDate        string            `json:"opname_date"`
	Status            StockOpnameStatus `json:"status"`
	ConductedByName   *string           `json:"conducted_by_name,omitempty"`
	ApprovedByName    *string           `json:"approved_by_name,omitempty"`
	Notes             *string           `json:"notes,omitempty"`
	TotalVarianceCost float64           `json:"total_variance_cost"`
	Items             []StockOpnameItem `json:"items,omitempty"`
	CreatedAt         time.Time         `json:"created_at"`
	UpdatedAt         time.Time         `json:"updated_at"`
}

type StockOpnameItem struct {
	ID                   uuid.UUID `json:"id"`
	StockOpnameID        uuid.UUID `json:"stock_opname_id"`
	ItemID               uuid.UUID `json:"item_id"`
	ItemCode             string    `json:"item_code"`
	ItemName             string    `json:"item_name"`
	Unit                 string    `json:"unit"`
	SystemTheoreticalQty *float64  `json:"system_theoretical_qty,omitempty"` // Hidden if user is floor staff
	PhysicalCountedQty   float64   `json:"physical_counted_qty"`
	VarianceQty          *float64  `json:"variance_qty,omitempty"`
	UnitCost             float64   `json:"unit_cost"`
	VarianceCost         *float64  `json:"variance_cost,omitempty"`
	VarianceCategory     string    `json:"variance_category"`
	Notes                *string   `json:"notes,omitempty"`
}

// WasteRecord represents registered spoilage, damaged ingredients, or staff meal.
type WasteRecord struct {
	ID             uuid.UUID         `json:"id"`
	TenantID       uuid.UUID         `json:"tenant_id"`
	OutletID       uuid.UUID         `json:"outlet_id"`
	OutletName     string            `json:"outlet_name"`
	WarehouseID    uuid.UUID         `json:"warehouse_id"`
	WarehouseName  string            `json:"warehouse_name"`
	WasteNumber    string            `json:"waste_number"`
	WasteDate      string            `json:"waste_date"`
	Category          string            `json:"category"` // EXPIRED_SPOILAGE, DROPPED_DAMAGED, COOKING_ERROR, STAFF_MEAL
	RecipientDivision *string           `json:"recipient_division,omitempty"`
	TotalCost         float64           `json:"total_cost"`
	PhotoURL          *string           `json:"photo_url,omitempty"`
	RecordedByName    *string           `json:"recorded_by_name,omitempty"`
	Notes             *string           `json:"notes,omitempty"`
	Items          []WasteRecordItem `json:"items,omitempty"`
	CreatedAt      time.Time         `json:"created_at"`
	UpdatedAt      time.Time         `json:"updated_at"`
}

type WasteRecordItem struct {
	ID           uuid.UUID `json:"id"`
	WasteID      uuid.UUID `json:"waste_id"`
	ItemID       uuid.UUID `json:"item_id"`
	ItemCode     string    `json:"item_code"`
	ItemName     string    `json:"item_name"`
	Quantity     float64   `json:"quantity"`
	Unit         string    `json:"unit"`
	UnitCost     float64   `json:"unit_cost"`
	SubtotalCost float64   `json:"subtotal_cost"`
	Notes        *string   `json:"notes,omitempty"`
}

// MenuHpaItem encapsulates the dual-mode HPA configuration (Dynamic BOM vs Manual Target).
type MenuHpaItem struct {
	ID                 uuid.UUID  `json:"id"`
	OutletID           *uuid.UUID `json:"outlet_id,omitempty"`
	OutletName         *string    `json:"outlet_name,omitempty"`
	CategoryName       string     `json:"category_name"`
	Code               string     `json:"code"`
	Name               string     `json:"name"`
	SellingPrice       float64    `json:"selling_price"`
	HpaCalculationMode string     `json:"hpa_calculation_mode"` // DYNAMIC_BOM vs MANUAL_OVERRIDE
	DynamicBomHpa      float64    `json:"dynamic_bom_hpa"`
	ManualHpa          float64    `json:"manual_hpa"`
	EffectiveHpa       float64    `json:"effective_hpa"`
	GrossMargin        float64    `json:"gross_margin"`
	FoodCostPct        float64    `json:"food_cost_pct"`
	VarianceAmount     float64    `json:"variance_amount"` // Dynamic - Manual
	VariancePct        float64    `json:"variance_pct"`
	IsVarianceAlert    bool       `json:"is_variance_alert"` // True if actual dynamic HPA exceeds target > 5%
	TargetFoodCostPct  float64    `json:"target_food_cost_pct"`
}

// Actor captures the authenticated caller.
type Actor struct {
	TenantID    uuid.UUID
	UserID      uuid.UUID
	Username    string
	Roles       []string
	Permissions map[string]struct{}
}

func (a Actor) HasPerm(code string) bool {
	_, ok := a.Permissions[code]
	return ok
}
