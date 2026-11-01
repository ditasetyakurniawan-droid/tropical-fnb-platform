// Package domain declares entities and contracts for POS, Dining Tables/Gazebos,
// Orders, Split Billing, and Large Event Reservations.
package domain

import (
	"context"
	"time"

	"github.com/google/uuid"
)

// TableStatus constants
const (
	TableStatusAvailable   = "AVAILABLE"
	TableStatusReserved    = "RESERVED"
	TableStatusOccupied    = "OCCUPIED"
	TableStatusBillPrinted = "BILL_PRINTED"
	TableStatusDirty       = "DIRTY"
)

// OrderType constants
const (
	OrderTypeDineIn           = "DINE_IN"
	OrderTypeTakeaway         = "TAKEAWAY"
	OrderTypeEventReservation = "EVENT_RESERVATION"
)

// PaymentFlow constants
const (
	PaymentFlowPayFirst = "PAY_FIRST"
	PaymentFlowPayAfter = "PAY_AFTER"
)

// OrderStatus constants
const (
	OrderStatusOpen      = "OPEN"
	OrderStatusInKitchen = "IN_KITCHEN"
	OrderStatusServed    = "SERVED"
	OrderStatusCompleted = "COMPLETED"
	OrderStatusCancelled = "CANCELLED"
	OrderStatusVoid      = "VOID"
)

// PaymentStatus constants
const (
	PaymentStatusUnpaid        = "UNPAID"
	PaymentStatusPartiallyPaid = "PARTIALLY_PAID"
	PaymentStatusPaid          = "PAID"
	PaymentStatusRefunded      = "REFUNDED"
)

// DiningTable represents an indoor restaurant table or outdoor tropical garden gazebo.
type DiningTable struct {
	ID                 uuid.UUID  `json:"id"`
	TenantID           uuid.UUID  `json:"tenant_id"`
	OutletID           uuid.UUID  `json:"outlet_id"`
	OutletCode         string     `json:"outlet_code"`
	TableNumber        string     `json:"table_number"`
	Section            string     `json:"section"` // INDOOR_MAIN, INDOOR_VIP, OUTDOOR_GAZEBO, OUTDOOR_JOGLO
	Capacity           int        `json:"capacity"`
	Shape              string     `json:"shape"` // RECTANGLE, ROUND, GAZEBO_OCTAGON
	Status             string     `json:"status"`
	ActiveOrderID      *uuid.UUID `json:"active_order_id,omitempty"`
	ActiveOrderNumber  *string    `json:"active_order_number,omitempty"`
	ActiveCustomerName *string    `json:"active_customer_name,omitempty"`
	ActiveOrderTotal   *float64   `json:"active_order_total,omitempty"`
	PosX               int        `json:"pos_x"`
	PosY               int        `json:"pos_y"`
	CreatedAt          time.Time  `json:"created_at"`
	UpdatedAt          time.Time  `json:"updated_at"`
}

// OrderItem represents a line item within a customer order.
type OrderItem struct {
	ID         uuid.UUID `json:"id"`
	OrderID    uuid.UUID `json:"order_id"`
	MenuItemID uuid.UUID `json:"menu_item_id"`
	ItemName   string    `json:"item_name"`
	UnitPrice  float64   `json:"unit_price"`
	Quantity   int       `json:"quantity"`
	Subtotal   float64   `json:"subtotal"`
	Notes      *string   `json:"notes,omitempty"`
	Status     string    `json:"status"` // ORDERED, COOKING, READY, SERVED, CANCELLED
	CreatedAt  time.Time `json:"created_at"`
	UpdatedAt  time.Time `json:"updated_at"`
}

// OrderPayment represents a tender payment transaction.
type OrderPayment struct {
	ID              uuid.UUID `json:"id"`
	OrderID         uuid.UUID `json:"order_id"`
	PaymentMethod   string    `json:"payment_method"` // CASH, QRIS, DEBIT_CARD, CREDIT_CARD, TRANSFER, SPLIT
	Amount          float64   `json:"amount"`
	ChangeGiven     float64   `json:"change_given"`
	ReferenceNumber *string   `json:"reference_number,omitempty"`
	PaidBy          *string   `json:"paid_by,omitempty"`
	PaidAt          time.Time `json:"paid_at"`
}

// SplitBillItem represents an item allocated to a split bill.
type SplitBillItem struct {
	ID          uuid.UUID `json:"id"`
	SplitBillID uuid.UUID `json:"split_bill_id"`
	OrderItemID uuid.UUID `json:"order_item_id"`
	ItemName    string    `json:"item_name"`
	Quantity    int       `json:"quantity"`
	Amount      float64   `json:"amount"`
}

// SplitBill represents an individual invoice within a split bill transaction.
type SplitBill struct {
	ID            uuid.UUID       `json:"id"`
	OrderID       uuid.UUID       `json:"order_id"`
	SplitNumber   int             `json:"split_number"`
	PayerName     string          `json:"payer_name"`
	Subtotal      float64         `json:"subtotal"`
	TaxPB1Amount  float64         `json:"tax_pb1_amount"`
	FinalAmount   float64         `json:"final_amount"`
	PaidAmount    float64         `json:"paid_amount"`
	PaymentMethod *string         `json:"payment_method,omitempty"`
	IsPaid        bool            `json:"is_paid"`
	PaidAt        *time.Time      `json:"paid_at,omitempty"`
	CreatedAt     time.Time       `json:"created_at"`
	Items         []SplitBillItem `json:"items,omitempty"`
}

// Order represents a full POS transaction (both PAY_FIRST counter and PAY_AFTER table service).
type Order struct {
	ID                   uuid.UUID      `json:"id"`
	TenantID             uuid.UUID      `json:"tenant_id"`
	OutletID             uuid.UUID      `json:"outlet_id"`
	OutletCode           string         `json:"outlet_code"`
	OrderNumber          string         `json:"order_number"`
	OrderType            string         `json:"order_type"`   // DINE_IN, TAKEAWAY, EVENT_RESERVATION
	PaymentFlow          string         `json:"payment_flow"` // PAY_FIRST, PAY_AFTER
	TableID              *uuid.UUID     `json:"table_id,omitempty"`
	TableNumber          *string        `json:"table_number,omitempty"`
	CustomerName         string         `json:"customer_name"`
	CustomerPhone        *string        `json:"customer_phone,omitempty"`
	PaxCount             int            `json:"pax_count"`
	Status               string         `json:"status"`         // OPEN, IN_KITCHEN, SERVED, COMPLETED, CANCELLED, VOID
	PaymentStatus        string         `json:"payment_status"` // UNPAID, PARTIALLY_PAID, PAID, REFUNDED
	Subtotal             float64        `json:"subtotal"`
	DiscountAmount       float64        `json:"discount_amount"`
	DiscountNote         *string        `json:"discount_note,omitempty"`
	TaxPB1Percent        float64        `json:"tax_pb1_percent"`
	TaxPB1Amount         float64        `json:"tax_pb1_amount"`
	ServiceChargePercent float64        `json:"service_charge_percent"`
	ServiceChargeAmount  float64        `json:"service_charge_amount"`
	FinalTotal           float64        `json:"final_total"`
	PaidAmount           float64        `json:"paid_amount"`
	ChangeAmount         float64        `json:"change_amount"`
	Notes                *string        `json:"notes,omitempty"`
	CreatedBy            *uuid.UUID     `json:"created_by,omitempty"`
	CreatedByName        *string        `json:"created_by_name,omitempty"`
	CreatedAt            time.Time      `json:"created_at"`
	UpdatedAt            time.Time      `json:"updated_at"`
	ClosedAt             *time.Time     `json:"closed_at,omitempty"`
	CustomerID           *uuid.UUID     `json:"customer_id,omitempty"`
	VoucherCode          *string        `json:"voucher_code,omitempty"`
	PointsRedeemed       int            `json:"points_redeemed,omitempty"`
	PointsDiscountAmount float64        `json:"points_discount_amount,omitempty"`
	DPClaimedAmount      float64        `json:"dp_claimed_amount,omitempty"`
	ReservationID        *uuid.UUID     `json:"reservation_id,omitempty"`
	ShiftID              *uuid.UUID     `json:"shift_id,omitempty"`
	StockDeducted        bool           `json:"stock_deducted"`
	StockDeductedAt      *time.Time     `json:"stock_deducted_at,omitempty"`
	Items                []OrderItem    `json:"items,omitempty"`
	Payments             []OrderPayment `json:"payments,omitempty"`
	SplitBills           []SplitBill    `json:"split_bills,omitempty"`
}

// Reservation represents an event or table booking (gathering, corporate event, etc.).
type Reservation struct {
	ID                     uuid.UUID             `json:"id"`
	TenantID               uuid.UUID             `json:"tenant_id"`
	OutletID               uuid.UUID             `json:"outlet_id"`
	OutletCode             string                `json:"outlet_code"`
	ReservationNumber      string                `json:"reservation_number"`
	CustomerID             *uuid.UUID            `json:"customer_id,omitempty"`
	CustomerName           string                `json:"customer_name"`
	CustomerPhone          string                `json:"customer_phone"`
	EventType              string                `json:"event_type"` // REGULAR_DINING, FAMILY_GATHERING, CORPORATE_EVENT, BIRTHDAY_PARTY, etc.
	PaxCount               int                   `json:"pax_count"`
	ReservationDate        string                `json:"reservation_date"` // YYYY-MM-DD
	StartTime              string                `json:"start_time"`       // HH:MM
	EndTime                *string               `json:"end_time,omitempty"`
	AssignedTableID        *uuid.UUID            `json:"assigned_table_id,omitempty"`
	AssignedTableNumber    *string               `json:"assigned_table_number,omitempty"`
	MinSpend               float64               `json:"min_spend"`
	DepositAmount          float64               `json:"deposit_amount"`
	DepositPaid            bool                  `json:"deposit_paid"`
	DepositPaymentMethod   *string               `json:"deposit_payment_method,omitempty"`
	DPReceiptRef           *string               `json:"dp_receipt_ref,omitempty"`
	DPClaimOrderID         *uuid.UUID            `json:"dp_claim_order_id,omitempty"`
	Status                 string                `json:"status"` // PENDING_DEPOSIT, CONFIRMED, SEATED, COMPLETED, CANCELLED, NO_SHOW
	SpecialRequests        *string               `json:"special_requests,omitempty"`
	BanquetPackageID       *uuid.UUID            `json:"banquet_package_id,omitempty"`
	BanquetPackageName     string                `json:"banquet_package_name,omitempty"`
	KitchenPrepStatus      string                `json:"kitchen_prep_status"` // QUEUED, IN_PREP, READY_FOR_EVENT, SERVED
	LayoutSetupNotes       *string               `json:"layout_setup_notes,omitempty"`
	WhatsAppReminderSentAt *time.Time            `json:"whatsapp_reminder_sent_at,omitempty"`
	Preorders              []ReservationPreorder `json:"preorders,omitempty"`
	CreatedAt              time.Time             `json:"created_at"`
	UpdatedAt              time.Time             `json:"updated_at"`
}

// BanquetPackage represents a buffet or set-menu package for events.
type BanquetPackage struct {
	ID          uuid.UUID            `json:"id"`
	TenantID    uuid.UUID            `json:"tenant_id"`
	OutletID    *uuid.UUID           `json:"outlet_id,omitempty"`
	Code        string               `json:"code"`
	Name        string               `json:"name"`
	Description string               `json:"description,omitempty"`
	MinPax      int                  `json:"min_pax"`
	PricePerPax float64              `json:"price_per_pax"`
	Category    string               `json:"category"` // BUFFET_PRASMANAN, VIP_SET_MENU, COFFEE_BREAK, CUSTOM_BANQUET
	IsActive    bool                 `json:"is_active"`
	CreatedAt   time.Time            `json:"created_at"`
	UpdatedAt   time.Time            `json:"updated_at"`
	Items       []BanquetPackageItem `json:"items,omitempty"`
}

// BanquetPackageItem represents an item mapped inside a banquet package.
type BanquetPackageItem struct {
	ID                uuid.UUID `json:"id"`
	PackageID         uuid.UUID `json:"package_id"`
	MenuItemID        uuid.UUID `json:"menu_item_id"`
	MenuItemName      string    `json:"menu_item_name,omitempty"`
	DishCourse        string    `json:"dish_course"` // APPETIZER, MAIN_COURSE, DESSERT, BEVERAGE
	PortionMultiplier float64   `json:"portion_multiplier"`
	Notes             string    `json:"notes,omitempty"`
	CreatedAt         time.Time `json:"created_at"`
}

// ReservationPreorder represents pre-ordered banquet dish items for an event.
type ReservationPreorder struct {
	ID                 uuid.UUID  `json:"id"`
	ReservationID      uuid.UUID  `json:"reservation_id"`
	MenuItemID         *uuid.UUID `json:"menu_item_id,omitempty"`
	BanquetPackageID   *uuid.UUID `json:"banquet_package_id,omitempty"`
	ItemName           string     `json:"item_name"`
	Quantity           int        `json:"quantity"`
	UnitPrice          float64    `json:"unit_price"`
	TotalPrice         float64    `json:"total_price"`
	ServingStage       string     `json:"serving_stage"`        // WELCOME_DRINK, STARTER, BUFFET_MAIN, CLOSING_DESSERT
	KitchenPrepStation string     `json:"kitchen_prep_station"` // GRILL, KITCHEN, BAR
	PrepStatus         string     `json:"prep_status"`          // QUEUED, IN_PREP, READY_FOR_EVENT
	SpecialNotes       string     `json:"special_notes,omitempty"`
	CreatedAt          time.Time  `json:"created_at"`
}

// CreateOrderItemRequest is the input payload for an individual order item.
type CreateOrderItemRequest struct {
	MenuItemID uuid.UUID `json:"menu_item_id"`
	Quantity   int       `json:"quantity"`
	Notes      *string   `json:"notes,omitempty"`
}

// CreateOrderRequest is the payload to open a new POS order.
type CreateOrderRequest struct {
	OutletID             uuid.UUID                `json:"outlet_id"`
	TableID              *uuid.UUID               `json:"table_id,omitempty"`
	CustomerID           *uuid.UUID               `json:"customer_id,omitempty"`
	CustomerName         string                   `json:"customer_name"`
	CustomerPhone        *string                  `json:"customer_phone,omitempty"`
	PaxCount             int                      `json:"pax_count"`
	OrderType            string                   `json:"order_type"`   // DINE_IN, TAKEAWAY, EVENT_RESERVATION
	PaymentFlow          string                   `json:"payment_flow"` // PAY_FIRST, PAY_AFTER
	VoucherCode          *string                  `json:"voucher_code,omitempty"`
	DiscountAmount       float64                  `json:"discount_amount,omitempty"`
	DiscountNote         *string                  `json:"discount_note,omitempty"`
	PointsRedeemed       int                      `json:"points_redeemed,omitempty"`
	PointsDiscountAmount float64                  `json:"points_discount_amount,omitempty"`
	DPClaimedAmount      float64                  `json:"dp_claimed_amount,omitempty"`
	ReservationID        *uuid.UUID               `json:"reservation_id,omitempty"`
	Notes                *string                  `json:"notes,omitempty"`
	Items                []CreateOrderItemRequest `json:"items"`
}

// ProcessPaymentRequest represents tendering payment for an order.
type ProcessPaymentRequest struct {
	PaymentMethod   string  `json:"payment_method"` // CASH, QRIS, DEBIT_CARD, CREDIT_CARD, TRANSFER
	Amount          float64 `json:"amount"`
	ReferenceNumber *string `json:"reference_number,omitempty"`
	PaidBy          *string `json:"paid_by,omitempty"`
}

// SplitEvenlyRequest initiates equal split billing.
type SplitEvenlyRequest struct {
	NumPersons int `json:"num_persons"`
}

// SplitItemAssignment maps an order item and quantity to a specific payer.
type SplitItemAssignment struct {
	OrderItemID uuid.UUID `json:"order_item_id"`
	Quantity    int       `json:"quantity"`
}

// SplitByItemsPayer represents one payer's bucket of items.
type SplitByItemsPayer struct {
	PayerName   string                `json:"payer_name"`
	Assignments []SplitItemAssignment `json:"assignments"`
}

// SplitByItemsRequest initiates by-item split billing.
type SplitByItemsRequest struct {
	Payers []SplitByItemsPayer `json:"payers"`
}

// PaySplitBillRequest tenders payment for an individual split bill.
type PaySplitBillRequest struct {
	PaymentMethod   string  `json:"payment_method"`
	Amount          float64 `json:"amount"`
	ReferenceNumber *string `json:"reference_number,omitempty"`
}

// CreateReservationPreorderInput for booking payload.
type CreateReservationPreorderInput struct {
	MenuItemID         *uuid.UUID `json:"menu_item_id,omitempty"`
	BanquetPackageID   *uuid.UUID `json:"banquet_package_id,omitempty"`
	ItemName           string     `json:"item_name"`
	Quantity           int        `json:"quantity"`
	UnitPrice          float64    `json:"unit_price"`
	ServingStage       string     `json:"serving_stage"`
	KitchenPrepStation string     `json:"kitchen_prep_station"`
	SpecialNotes       string     `json:"special_notes,omitempty"`
}

// CreateReservationRequest payload for booking an event or table.
type CreateReservationRequest struct {
	OutletID             uuid.UUID                        `json:"outlet_id"`
	CustomerID           *uuid.UUID                       `json:"customer_id,omitempty"`
	CustomerName         string                           `json:"customer_name"`
	CustomerPhone        string                           `json:"customer_phone"`
	EventType            string                           `json:"event_type"`
	PaxCount             int                              `json:"pax_count"`
	ReservationDate      string                           `json:"reservation_date"` // YYYY-MM-DD
	StartTime            string                           `json:"start_time"`       // HH:MM
	EndTime              *string                          `json:"end_time,omitempty"`
	AssignedTableID      *uuid.UUID                       `json:"assigned_table_id,omitempty"`
	MinSpend             float64                          `json:"min_spend"`
	DepositAmount        float64                          `json:"deposit_amount"`
	DepositPaid          bool                             `json:"deposit_paid"`
	DepositPaymentMethod *string                          `json:"deposit_payment_method,omitempty"`
	DPReceiptRef         *string                          `json:"dp_receipt_ref,omitempty"`
	SpecialRequests      *string                          `json:"special_requests,omitempty"`
	BanquetPackageID     *uuid.UUID                       `json:"banquet_package_id,omitempty"`
	LayoutSetupNotes     *string                          `json:"layout_setup_notes,omitempty"`
	Preorders            []CreateReservationPreorderInput `json:"preorders,omitempty"`
}

// KitchenTicketItem represents an item within a kitchen display ticket.
type KitchenTicketItem struct {
	ID           uuid.UUID `json:"id"`
	MenuItemID   uuid.UUID `json:"menu_item_id"`
	ItemName     string    `json:"item_name"`
	CategoryCode string    `json:"category_code"`
	CategoryName string    `json:"category_name"`
	Station      string    `json:"station"` // GRILL_STEAK, SIDES_PANTRY, BEVERAGE_BAR, BAKARAN_GORENG, DAPUR_NUSANTARA, BAR_TRADISIONAL, EXPEDITER
	Quantity     int       `json:"quantity"`
	Notes        *string   `json:"notes,omitempty"`
	Status       string    `json:"status"` // ORDERED, COOKING, READY, SERVED, CANCELLED
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

// KitchenTicket represents an order ticket on the Kitchen Display System (KDS).
type KitchenTicket struct {
	ID           uuid.UUID           `json:"id"`
	TenantID     uuid.UUID           `json:"tenant_id"`
	OutletID     uuid.UUID           `json:"outlet_id"`
	OutletCode   string              `json:"outlet_code"`
	OutletName   string              `json:"outlet_name"`
	OrderNumber  string              `json:"order_number"`
	OrderType    string              `json:"order_type"` // DINE_IN, TAKEAWAY, EVENT_RESERVATION
	TableID      *uuid.UUID          `json:"table_id,omitempty"`
	TableNumber  *string             `json:"table_number,omitempty"`
	Section      *string             `json:"section,omitempty"`
	CustomerName string              `json:"customer_name"`
	PaxCount     int                 `json:"pax_count"`
	Status       string              `json:"status"` // IN_KITCHEN, SERVED, COMPLETED
	CreatedAt    time.Time           `json:"created_at"`
	UpdatedAt    time.Time           `json:"updated_at"`
	Items        []KitchenTicketItem `json:"items"`
}

// Repository defines data access operations for POS.
type Repository interface {
	ListTables(ctx context.Context, tenantID uuid.UUID, outletID *uuid.UUID, section *string) ([]DiningTable, error)
	GetTableByID(ctx context.Context, tenantID, tableID uuid.UUID) (*DiningTable, error)
	UpdateTableStatus(ctx context.Context, tenantID, tableID uuid.UUID, status string, activeOrderID *uuid.UUID) error

	ListOrders(ctx context.Context, tenantID uuid.UUID, outletID *uuid.UUID, status *string) ([]Order, error)
	GetOrderByID(ctx context.Context, tenantID, orderID uuid.UUID) (*Order, error)
	CreateOrder(ctx context.Context, order *Order, items []OrderItem) (*Order, error)
	AddOrderItems(ctx context.Context, tenantID, orderID uuid.UUID, items []OrderItem) (*Order, error)
	ApplyPayment(ctx context.Context, tenantID, orderID uuid.UUID, payment OrderPayment) (*Order, error)

	SaveSplitBills(ctx context.Context, tenantID, orderID uuid.UUID, splits []SplitBill) ([]SplitBill, error)
	PaySplitBill(ctx context.Context, tenantID, orderID, splitBillID uuid.UUID, paymentMethod string, amount float64) (*SplitBill, *Order, error)

	ListReservations(ctx context.Context, tenantID uuid.UUID, outletID *uuid.UUID, date *string) ([]Reservation, error)
	CreateReservation(ctx context.Context, res *Reservation) (*Reservation, error)
	CheckInReservation(ctx context.Context, tenantID, reservationID, tableID uuid.UUID, createdBy uuid.UUID) (*Order, error)
	ListBanquetPackages(ctx context.Context, tenantID uuid.UUID, outletID *uuid.UUID) ([]BanquetPackage, error)
	CreateBanquetPackage(ctx context.Context, pkg *BanquetPackage) (*BanquetPackage, error)
	ListReservationPreorders(ctx context.Context, tenantID, reservationID uuid.UUID) ([]ReservationPreorder, error)
	AddReservationPreorder(ctx context.Context, preorder *ReservationPreorder) (*ReservationPreorder, error)
	UpdateReservationPrepStatus(ctx context.Context, tenantID, reservationID uuid.UUID, prepStatus string) error
	SendReservationWAReminder(ctx context.Context, tenantID, reservationID uuid.UUID) (*Reservation, error)

	GetMenuItemMap(ctx context.Context, tenantID uuid.UUID) (map[uuid.UUID]string, map[uuid.UUID]float64, error)
	GetUserIDByUsername(ctx context.Context, tenantID uuid.UUID, username string) (uuid.UUID, error)

	// KDS operations
	ListKitchenTickets(ctx context.Context, tenantID uuid.UUID, outletID *uuid.UUID, station *string, includeServed bool) ([]KitchenTicket, error)
	UpdateOrderItemStatus(ctx context.Context, tenantID, orderID, itemID uuid.UUID, status string) error
	UpdateOrderStatus(ctx context.Context, tenantID, orderID uuid.UUID, status string) error
	BumpTicket(ctx context.Context, tenantID, orderID uuid.UUID, targetStatus string) (*KitchenTicket, error)

	// Shift & Cash Drawer operations
	GetCurrentOpenShift(ctx context.Context, tenantID, outletID uuid.UUID) (*CashierShift, error)
	GetShiftByID(ctx context.Context, tenantID, shiftID uuid.UUID) (*CashierShift, error)
	OpenShift(ctx context.Context, shift *CashierShift) (*CashierShift, error)
	CloseShift(ctx context.Context, tenantID, shiftID uuid.UUID, actualCash float64, supervisorID *uuid.UUID, notes *string) (*CashierShift, error)
	AddCashMovement(ctx context.Context, movement *CashierShiftCashMovement) (*CashierShiftCashMovement, error)
	ListCashMovements(ctx context.Context, tenantID, shiftID uuid.UUID) ([]CashierShiftCashMovement, error)
	ListShifts(ctx context.Context, tenantID uuid.UUID, outletID *uuid.UUID, status *string, limit int) ([]CashierShift, error)
	GetShiftReport(ctx context.Context, tenantID, shiftID uuid.UUID, reportType string, generatedBy string) (*ShiftReportResponse, error)
	VerifySupervisorPIN(ctx context.Context, tenantID uuid.UUID, outletID *uuid.UUID, pin string) (bool, string, *uuid.UUID, error)
}

// CashierShift represents a cashier drawer shift session and cash reconciliation.
type CashierShift struct {
	ID                uuid.UUID  `json:"id"`
	TenantID          uuid.UUID  `json:"tenant_id"`
	OutletID          uuid.UUID  `json:"outlet_id"`
	OutletCode        string     `json:"outlet_code,omitempty"`
	OutletName        string     `json:"outlet_name,omitempty"`
	ShiftNumber       string     `json:"shift_number"`
	CashierUserID     uuid.UUID  `json:"cashier_user_id"`
	CashierName       string     `json:"cashier_name,omitempty"`
	SupervisorUserID  *uuid.UUID `json:"supervisor_user_id,omitempty"`
	SupervisorName    *string    `json:"supervisor_name,omitempty"`
	ShiftName         string     `json:"shift_name"` // SHIFT_PAGI, SHIFT_SORE, SHIFT_FULL
	Status            string     `json:"status"`     // OPEN, CLOSED
	OpenedAt          time.Time  `json:"opened_at"`
	ClosedAt          *time.Time `json:"closed_at,omitempty"`
	OpeningCash       float64    `json:"opening_cash"`
	ExpectedCash      float64    `json:"expected_cash"`
	ActualCash        *float64   `json:"actual_cash,omitempty"`
	CashDifference    float64    `json:"cash_difference"`
	TotalTransactions int        `json:"total_transactions"`
	GrossSales        float64    `json:"gross_sales"`
	Discounts         float64    `json:"discounts"`
	NetSales          float64    `json:"net_sales"`
	TaxPB1            float64    `json:"tax_pb1"`
	ServiceCharge     float64    `json:"service_charge"`
	PaymentCash       float64    `json:"payment_cash"`
	PaymentQRIS       float64    `json:"payment_qris"`
	PaymentCard       float64    `json:"payment_card"`
	PaymentTransfer   float64    `json:"payment_transfer"`
	TotalPaidIn       float64    `json:"total_paid_in"`
	TotalPaidOut      float64    `json:"total_paid_out"`
	Notes             *string    `json:"notes,omitempty"`
	CreatedAt         time.Time  `json:"created_at"`
	UpdatedAt         time.Time  `json:"updated_at"`
}

// CashierShiftCashMovement represents a Pay-In or Pay-Out transaction for petty cash.
type CashierShiftCashMovement struct {
	ID             uuid.UUID  `json:"id"`
	TenantID       uuid.UUID  `json:"tenant_id"`
	ShiftID        uuid.UUID  `json:"shift_id"`
	MovementType   string     `json:"movement_type"` // PAID_IN, PAID_OUT
	Amount         float64    `json:"amount"`
	Reason         string     `json:"reason"`
	AuthorizedBy   *uuid.UUID `json:"authorized_by,omitempty"`
	AuthorizerName *string    `json:"authorizer_name,omitempty"`
	CreatedAt      time.Time  `json:"created_at"`
}

// OpenShiftRequest contains parameters to open a cashier shift.
type OpenShiftRequest struct {
	OutletID    uuid.UUID `json:"outlet_id"`
	ShiftName   string    `json:"shift_name"` // SHIFT_PAGI, SHIFT_SORE, SHIFT_FULL
	OpeningCash float64   `json:"opening_cash"`
	Notes       *string   `json:"notes,omitempty"`
}

// CloseShiftRequest contains parameters to close a cashier shift with blind physical cash count.
type CloseShiftRequest struct {
	ActualCash       float64    `json:"actual_cash"`
	SupervisorUserID *uuid.UUID `json:"supervisor_user_id,omitempty"`
	SupervisorPIN    *string    `json:"supervisor_pin,omitempty"`
	Notes            *string    `json:"notes,omitempty"`
}

// CashMovementRequest contains parameters to log paid-in or paid-out petty cash.
type CashMovementRequest struct {
	MovementType  string  `json:"movement_type"` // PAID_IN, PAID_OUT
	Amount        float64 `json:"amount"`
	Reason        string  `json:"reason"`
	SupervisorPIN *string `json:"supervisor_pin,omitempty"`
}

// ShiftReportResponse provides the official audit X-Report or Z-Report structure.
type ShiftReportResponse struct {
	Shift       CashierShift               `json:"shift"`
	Movements   []CashierShiftCashMovement `json:"movements"`
	ReportType  string                     `json:"report_type"` // X_REPORT, Z_REPORT
	GeneratedAt time.Time                  `json:"generated_at"`
	GeneratedBy string                     `json:"generated_by"`
}
