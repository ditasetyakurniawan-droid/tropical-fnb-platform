// Package usecase implements business logic for POS cashiering, dining tables,
// zero-leak split billing, and event reservations.
package usecase

import (
	"context"
	"fmt"
	"math"

	"github.com/google/uuid"

	"tropical-fnb/backend/internal/modules/pos/domain"
	"tropical-fnb/backend/internal/platform/currency"
)

// POSUsecase handles business operations for the POS module.
type POSUsecase struct {
	repo domain.Repository
}

// NewPOSUsecase creates a new POS usecase instance.
func NewPOSUsecase(repo domain.Repository) *POSUsecase {
	return &POSUsecase{repo: repo}
}

// ListTables retrieves all tables and gazebos with their current status.
func (u *POSUsecase) ListTables(ctx context.Context, tenantID uuid.UUID, outletID *uuid.UUID, section *string) ([]domain.DiningTable, error) {
	return u.repo.ListTables(ctx, tenantID, outletID, section)
}

// UpdateTableStatus modifies table status (e.g. DIRTY -> AVAILABLE after cleaning).
func (u *POSUsecase) UpdateTableStatus(ctx context.Context, tenantID, tableID uuid.UUID, status string) error {
	switch status {
	case domain.TableStatusAvailable, domain.TableStatusDirty, domain.TableStatusReserved, domain.TableStatusOccupied:
	default:
		return domain.Invalid("invalid table status: %s", status)
	}

	var activeOrderID *uuid.UUID
	if status == domain.TableStatusAvailable || status == domain.TableStatusDirty {
		activeOrderID = nil
	}
	return u.repo.UpdateTableStatus(ctx, tenantID, tableID, status, activeOrderID)
}

// ListOrders fetches recent orders.
func (u *POSUsecase) ListOrders(ctx context.Context, tenantID uuid.UUID, outletID *uuid.UUID, status *string) ([]domain.Order, error) {
	return u.repo.ListOrders(ctx, tenantID, outletID, status)
}

// GetOrderByID loads order details with items and payment history.
func (u *POSUsecase) GetOrderByID(ctx context.Context, tenantID, orderID uuid.UUID) (*domain.Order, error) {
	return u.repo.GetOrderByID(ctx, tenantID, orderID)
}

// CreateOrder validates items, computes PB1 10% tax, and persists the order.
func (u *POSUsecase) CreateOrder(ctx context.Context, tenantID, userID uuid.UUID, req domain.CreateOrderRequest, menuItemsMap map[uuid.UUID]string, menuPricesMap map[uuid.UUID]float64) (*domain.Order, error) {
	if req.CustomerName == "" {
		req.CustomerName = "Tamu"
	}
	if req.PaxCount <= 0 {
		req.PaxCount = 1
	}
	if req.OrderType == "" {
		req.OrderType = domain.OrderTypeDineIn
	}
	if req.PaymentFlow == "" {
		req.PaymentFlow = domain.PaymentFlowPayAfter
	}

	if len(req.Items) == 0 {
		return nil, domain.Invalid("minimal 1 item harus dipesan")
	}

	var items []domain.OrderItem
	var subtotal float64

	for _, itReq := range req.Items {
		if itReq.Quantity <= 0 {
			return nil, domain.Invalid("jumlah pesanan item harus lebih besar dari 0")
		}
		name, exists := menuItemsMap[itReq.MenuItemID]
		if !exists {
			return nil, domain.Invalid("menu item not found: %s", itReq.MenuItemID)
		}
		price := menuPricesMap[itReq.MenuItemID]
		lineSub := price * float64(itReq.Quantity)
		subtotal += lineSub

		items = append(items, domain.OrderItem{
			MenuItemID: itReq.MenuItemID,
			ItemName:   name,
			UnitPrice:  price,
			Quantity:   itReq.Quantity,
			Subtotal:   lineSub,
			Notes:      itReq.Notes,
			Status:     "ORDERED",
		})
	}

	taxPercent := 10.0 // Standard PB1 Restaurant Tax
	taxAmount := currency.CalculateTaxPB1(subtotal, taxPercent)
	finalTotal := subtotal + taxAmount

	order := &domain.Order{
		TenantID:             tenantID,
		OutletID:             req.OutletID,
		OrderType:            req.OrderType,
		PaymentFlow:          req.PaymentFlow,
		TableID:              req.TableID,
		CustomerName:         req.CustomerName,
		CustomerPhone:        req.CustomerPhone,
		PaxCount:             req.PaxCount,
		Status:               domain.OrderStatusOpen,
		PaymentStatus:        domain.PaymentStatusUnpaid,
		Subtotal:             subtotal,
		TaxPB1Percent:        taxPercent,
		TaxPB1Amount:         taxAmount,
		ServiceChargePercent: 0,
		ServiceChargeAmount:  0,
		FinalTotal:           finalTotal,
		Notes:                req.Notes,
		CreatedBy:            &userID,
	}

	return u.repo.CreateOrder(ctx, order, items)
}

// AddOrderItems appends extra items to an open dine-in table order.
func (u *POSUsecase) AddOrderItems(ctx context.Context, tenantID, orderID uuid.UUID, items []domain.OrderItem) (*domain.Order, error) {
	if len(items) == 0 {
		return nil, domain.Invalid("minimal 1 item harus ditambahkan")
	}
	for i := range items {
		if items[i].Quantity <= 0 {
			return nil, domain.Invalid("jumlah pesanan item harus lebih besar dari 0")
		}
		items[i].Subtotal = items[i].UnitPrice * float64(items[i].Quantity)
		items[i].Status = "ORDERED"
	}
	return u.repo.AddOrderItems(ctx, tenantID, orderID, items)
}

// ProcessPayment processes full or partial payment tender.
func (u *POSUsecase) ProcessPayment(ctx context.Context, tenantID, orderID uuid.UUID, req domain.ProcessPaymentRequest) (*domain.Order, error) {
	if req.Amount <= 0 {
		return nil, domain.Invalid("payment amount must be greater than zero")
	}

	payment := domain.OrderPayment{
		PaymentMethod:   req.PaymentMethod,
		Amount:          req.Amount,
		ReferenceNumber: req.ReferenceNumber,
		PaidBy:          req.PaidBy,
	}

	return u.repo.ApplyPayment(ctx, tenantID, orderID, payment)
}

// SplitBillEvenly partitions an order total across N persons with zero-leak remainder distribution.
func (u *POSUsecase) SplitBillEvenly(ctx context.Context, tenantID, orderID uuid.UUID, numPersons int) ([]domain.SplitBill, error) {
	if numPersons < 2 {
		return nil, domain.Invalid("num_persons must be at least 2")
	}

	order, err := u.repo.GetOrderByID(ctx, tenantID, orderID)
	if err != nil {
		return nil, err
	}

	splits := currency.SplitEvenly(order.FinalTotal, numPersons)
	subtotalSplits := currency.SplitEvenly(order.Subtotal, numPersons)
	taxSplits := currency.SplitEvenly(order.TaxPB1Amount, numPersons)

	splitBills := make([]domain.SplitBill, numPersons)
	for i := 0; i < numPersons; i++ {
		splitBills[i] = domain.SplitBill{
			OrderID:      orderID,
			SplitNumber:  i + 1,
			PayerName:    fmt.Sprintf("Tamu %d", i+1),
			Subtotal:     subtotalSplits[i],
			TaxPB1Amount: taxSplits[i],
			FinalAmount:  splits[i],
			PaidAmount:   0,
			IsPaid:       false,
		}
	}

	return u.repo.SaveSplitBills(ctx, tenantID, orderID, splitBills)
}

// SplitBillByItems partitions an order based on item allocations per payer.
func (u *POSUsecase) SplitBillByItems(ctx context.Context, tenantID, orderID uuid.UUID, req domain.SplitByItemsRequest) ([]domain.SplitBill, error) {
	if len(req.Payers) < 2 {
		return nil, domain.Invalid("minimum 2 payers required for split by items")
	}

	order, err := u.repo.GetOrderByID(ctx, tenantID, orderID)
	if err != nil {
		return nil, err
	}

	itemPriceMap := make(map[uuid.UUID]float64)
	itemNameMap := make(map[uuid.UUID]string)
	for _, it := range order.Items {
		itemPriceMap[it.ID] = it.UnitPrice
		itemNameMap[it.ID] = it.ItemName
	}

	subtotals := make([]float64, len(req.Payers))
	payerItems := make([][]domain.SplitBillItem, len(req.Payers))

	for i, payer := range req.Payers {
		var pSub float64
		for _, assign := range payer.Assignments {
			price, ok := itemPriceMap[assign.OrderItemID]
			if !ok {
				return nil, domain.Invalid("item %s not in order", assign.OrderItemID)
			}
			amt := price * float64(assign.Quantity)
			pSub += amt
			payerItems[i] = append(payerItems[i], domain.SplitBillItem{
				OrderItemID: assign.OrderItemID,
				ItemName:    itemNameMap[assign.OrderItemID],
				Quantity:    assign.Quantity,
				Amount:      amt,
			})
		}
		subtotals[i] = pSub
	}

	splitResults := currency.SplitByItems(subtotals, order.TaxPB1Percent)
	splitBills := make([]domain.SplitBill, len(req.Payers))

	for i, res := range splitResults {
		payerName := req.Payers[i].PayerName
		if payerName == "" {
			payerName = fmt.Sprintf("Tamu %d", i+1)
		}

		splitBills[i] = domain.SplitBill{
			OrderID:      orderID,
			SplitNumber:  i + 1,
			PayerName:    payerName,
			Subtotal:     res.Subtotal,
			TaxPB1Amount: res.TaxPB1,
			FinalAmount:  res.FinalTotal,
			PaidAmount:   0,
			IsPaid:       false,
			Items:        payerItems[i],
		}
	}

	return u.repo.SaveSplitBills(ctx, tenantID, orderID, splitBills)
}

// PaySplitBill settles an individual split bill.
func (u *POSUsecase) PaySplitBill(ctx context.Context, tenantID, orderID, splitBillID uuid.UUID, paymentMethod string, amount float64) (*domain.SplitBill, *domain.Order, error) {
	if amount <= 0 {
		return nil, nil, domain.Invalid("payment amount must be greater than zero")
	}
	return u.repo.PaySplitBill(ctx, tenantID, orderID, splitBillID, paymentMethod, amount)
}

// ListReservations fetches upcoming reservations.
func (u *POSUsecase) ListReservations(ctx context.Context, tenantID uuid.UUID, outletID *uuid.UUID, date *string) ([]domain.Reservation, error) {
	return u.repo.ListReservations(ctx, tenantID, outletID, date)
}

// CreateReservation validates event requirements and books the table.
func (u *POSUsecase) CreateReservation(ctx context.Context, tenantID uuid.UUID, req domain.CreateReservationRequest) (*domain.Reservation, error) {
	if req.CustomerName == "" || req.CustomerPhone == "" {
		return nil, domain.Invalid("customer_name and customer_phone are required")
	}
	if req.PaxCount <= 0 {
		return nil, domain.Invalid("pax_count must be at least 1")
	}
	if req.ReservationDate == "" || req.StartTime == "" {
		return nil, domain.Invalid("reservation_date and start_time are required")
	}
	if req.EventType == "" {
		req.EventType = "REGULAR_DINING"
	}

	status := "CONFIRMED"
	if req.DepositAmount > 0 && !req.DepositPaid {
		status = "PENDING_DEPOSIT"
	}

	var preorders []domain.ReservationPreorder
	for _, p := range req.Preorders {
		preorders = append(preorders, domain.ReservationPreorder{
			MenuItemID:         p.MenuItemID,
			BanquetPackageID:   p.BanquetPackageID,
			ItemName:           p.ItemName,
			Quantity:           p.Quantity,
			UnitPrice:          p.UnitPrice,
			TotalPrice:         float64(p.Quantity) * p.UnitPrice,
			ServingStage:       p.ServingStage,
			KitchenPrepStation: p.KitchenPrepStation,
			SpecialNotes:       p.SpecialNotes,
		})
	}

	res := &domain.Reservation{
		TenantID:             tenantID,
		OutletID:             req.OutletID,
		CustomerID:           req.CustomerID,
		CustomerName:         req.CustomerName,
		CustomerPhone:        req.CustomerPhone,
		EventType:            req.EventType,
		PaxCount:             req.PaxCount,
		ReservationDate:      req.ReservationDate,
		StartTime:            req.StartTime,
		EndTime:              req.EndTime,
		AssignedTableID:      req.AssignedTableID,
		MinSpend:             math.Round(req.MinSpend),
		DepositAmount:        math.Round(req.DepositAmount),
		DepositPaid:          req.DepositPaid,
		DepositPaymentMethod: req.DepositPaymentMethod,
		DPReceiptRef:         req.DPReceiptRef,
		Status:               status,
		SpecialRequests:      req.SpecialRequests,
		BanquetPackageID:     req.BanquetPackageID,
		KitchenPrepStatus:    "QUEUED",
		LayoutSetupNotes:     req.LayoutSetupNotes,
		Preorders:            preorders,
	}

	return u.repo.CreateReservation(ctx, res)
}

// ListBanquetPackages fetches active banquet packages.
func (u *POSUsecase) ListBanquetPackages(ctx context.Context, tenantID uuid.UUID, outletID *uuid.UUID) ([]domain.BanquetPackage, error) {
	return u.repo.ListBanquetPackages(ctx, tenantID, outletID)
}

// CreateBanquetPackage creates a new banquet/buffet package.
func (u *POSUsecase) CreateBanquetPackage(ctx context.Context, tenantID uuid.UUID, pkg *domain.BanquetPackage) (*domain.BanquetPackage, error) {
	pkg.TenantID = tenantID
	return u.repo.CreateBanquetPackage(ctx, pkg)
}

// ListReservationPreorders lists dishes booked for an event.
func (u *POSUsecase) ListReservationPreorders(ctx context.Context, tenantID, reservationID uuid.UUID) ([]domain.ReservationPreorder, error) {
	return u.repo.ListReservationPreorders(ctx, tenantID, reservationID)
}

// AddReservationPreorder adds a dish to a reservation preorder.
func (u *POSUsecase) AddReservationPreorder(ctx context.Context, tenantID, reservationID uuid.UUID, preorder *domain.ReservationPreorder) (*domain.ReservationPreorder, error) {
	preorder.ReservationID = reservationID
	return u.repo.AddReservationPreorder(ctx, preorder)
}

// UpdateReservationPrepStatus updates the kitchen prep status.
func (u *POSUsecase) UpdateReservationPrepStatus(ctx context.Context, tenantID, reservationID uuid.UUID, prepStatus string) error {
	return u.repo.UpdateReservationPrepStatus(ctx, tenantID, reservationID, prepStatus)
}

// SendReservationWAReminder marks reminder as sent and returns the reservation.
func (u *POSUsecase) SendReservationWAReminder(ctx context.Context, tenantID, reservationID uuid.UUID) (*domain.Reservation, error) {
	return u.repo.SendReservationWAReminder(ctx, tenantID, reservationID)
}

// CheckInReservation seats the reservation at the table and opens an active order.
func (u *POSUsecase) CheckInReservation(ctx context.Context, tenantID, reservationID, tableID, userID uuid.UUID) (*domain.Order, error) {
	return u.repo.CheckInReservation(ctx, tenantID, reservationID, tableID, userID)
}

// GetMenuItemMap returns validated menu prices and names.
func (u *POSUsecase) GetMenuItemMap(ctx context.Context, tenantID uuid.UUID) (map[uuid.UUID]string, map[uuid.UUID]float64, error) {
	return u.repo.GetMenuItemMap(ctx, tenantID)
}

// GetUserIDByUsername finds user ID by username.
func (u *POSUsecase) GetUserIDByUsername(ctx context.Context, tenantID uuid.UUID, username string) (uuid.UUID, error) {
	return u.repo.GetUserIDByUsername(ctx, tenantID, username)
}

// ListKitchenTickets returns active kitchen tickets filtered by outlet and station.
func (u *POSUsecase) ListKitchenTickets(ctx context.Context, tenantID uuid.UUID, outletID *uuid.UUID, station *string, includeServed bool) ([]domain.KitchenTicket, error) {
	return u.repo.ListKitchenTickets(ctx, tenantID, outletID, station, includeServed)
}

// UpdateOrderItemStatus updates the status of an item (e.g. ORDERED -> COOKING -> READY -> SERVED).
func (u *POSUsecase) UpdateOrderItemStatus(ctx context.Context, tenantID, orderID, itemID uuid.UUID, status string) error {
	return u.repo.UpdateOrderItemStatus(ctx, tenantID, orderID, itemID, status)
}

// UpdateOrderStatus updates overall order status with defensive domain validation.
func (u *POSUsecase) UpdateOrderStatus(ctx context.Context, tenantID, orderID uuid.UUID, status string) error {
	switch status {
	case "OPEN", "IN_KITCHEN", "SERVED", "COMPLETED", "CANCELLED", "VOID":
		return u.repo.UpdateOrderStatus(ctx, tenantID, orderID, status)
	case "READY":
		// When marked READY at ticket level, bump items to READY while maintaining valid order lifecycle
		_, err := u.repo.BumpTicket(ctx, tenantID, orderID, "READY")
		return err
	default:
		return domain.Invalid("status pesanan tidak valid: %s", status)
	}
}

// BumpTicket transitions an entire ticket to the target status.
func (u *POSUsecase) BumpTicket(ctx context.Context, tenantID, orderID uuid.UUID, targetStatus string) (*domain.KitchenTicket, error) {
	return u.repo.BumpTicket(ctx, tenantID, orderID, targetStatus)
}

// ----------------------------------------------------------------------------
// Shift Management & Cash Drawer Usecases
// ----------------------------------------------------------------------------

// GetCurrentOpenShift returns the active open shift for an outlet.
func (u *POSUsecase) GetCurrentOpenShift(ctx context.Context, tenantID, outletID uuid.UUID) (*domain.CashierShift, error) {
	return u.repo.GetCurrentOpenShift(ctx, tenantID, outletID)
}

// GetShiftByID returns a shift by ID.
func (u *POSUsecase) GetShiftByID(ctx context.Context, tenantID, shiftID uuid.UUID) (*domain.CashierShift, error) {
	return u.repo.GetShiftByID(ctx, tenantID, shiftID)
}

// OpenShift validates and opens a new cashier drawer shift session.
func (u *POSUsecase) OpenShift(ctx context.Context, tenantID, userID uuid.UUID, req domain.OpenShiftRequest) (*domain.CashierShift, error) {
	if req.OutletID == uuid.Nil {
		return nil, domain.Invalid("outlet_id diperlukan untuk membuka shift")
	}
	if req.OpeningCash < 0 {
		return nil, domain.Invalid("modal awal (opening cash) tidak boleh negatif")
	}
	if req.ShiftName == "" {
		req.ShiftName = "SHIFT_PAGI"
	}

	shift := &domain.CashierShift{
		TenantID:      tenantID,
		OutletID:      req.OutletID,
		CashierUserID: userID,
		ShiftName:     req.ShiftName,
		OpeningCash:   req.OpeningCash,
		Notes:         req.Notes,
	}

	return u.repo.OpenShift(ctx, shift)
}

// CloseShift calculates final cash reconciliation and closes the shift session.
func (u *POSUsecase) CloseShift(ctx context.Context, tenantID, shiftID uuid.UUID, req domain.CloseShiftRequest) (*domain.CashierShift, error) {
	if req.ActualCash < 0 {
		return nil, domain.Invalid("hitungan fisik kas tidak boleh bernilai negatif")
	}

	shift, err := u.repo.GetShiftByID(ctx, tenantID, shiftID)
	if err != nil {
		return nil, err
	}

	var supervisorID *uuid.UUID = req.SupervisorUserID
	if req.SupervisorPIN != nil && *req.SupervisorPIN != "" {
		valid, _, verifiedID, err := u.repo.VerifySupervisorPIN(ctx, tenantID, &shift.OutletID, *req.SupervisorPIN)
		if err != nil {
			return nil, fmt.Errorf("validasi supervisor: %w", err)
		}
		if !valid {
			return nil, domain.Invalid("PIN Supervisor / Manajer tidak valid")
		}
		supervisorID = verifiedID
	}

	return u.repo.CloseShift(ctx, tenantID, shiftID, req.ActualCash, supervisorID, req.Notes)
}

// AddCashMovement handles paid-in / paid-out petty cash transactions.
func (u *POSUsecase) AddCashMovement(ctx context.Context, tenantID, shiftID uuid.UUID, req domain.CashMovementRequest) (*domain.CashierShiftCashMovement, error) {
	if req.Amount <= 0 {
		return nil, domain.Invalid("jumlah mutasi kas harus lebih dari 0")
	}
	if req.MovementType != "PAID_IN" && req.MovementType != "PAID_OUT" {
		return nil, domain.Invalid("movement_type harus PAID_IN atau PAID_OUT")
	}
	if req.Reason == "" {
		return nil, domain.Invalid("alasan pengeluaran / pemasukan kas wajib diisi")
	}

	shift, err := u.repo.GetShiftByID(ctx, tenantID, shiftID)
	if err != nil {
		return nil, err
	}
	if shift.Status == "CLOSED" {
		return nil, domain.Invalid("tidak dapat menambah mutasi kas pada shift yang sudah ditutup")
	}

	var authorizedBy *uuid.UUID
	if req.SupervisorPIN != nil && *req.SupervisorPIN != "" {
		valid, _, verifiedID, err := u.repo.VerifySupervisorPIN(ctx, tenantID, &shift.OutletID, *req.SupervisorPIN)
		if err != nil {
			return nil, fmt.Errorf("validasi supervisor: %w", err)
		}
		if !valid {
			return nil, domain.Invalid("PIN Supervisor / Manajer tidak valid")
		}
		authorizedBy = verifiedID
	}

	movement := &domain.CashierShiftCashMovement{
		TenantID:     tenantID,
		ShiftID:      shiftID,
		MovementType: req.MovementType,
		Amount:       req.Amount,
		Reason:       req.Reason,
		AuthorizedBy: authorizedBy,
	}

	return u.repo.AddCashMovement(ctx, movement)
}

// ListCashMovements returns petty cash movements for a shift.
func (u *POSUsecase) ListCashMovements(ctx context.Context, tenantID, shiftID uuid.UUID) ([]domain.CashierShiftCashMovement, error) {
	return u.repo.ListCashMovements(ctx, tenantID, shiftID)
}

// ListShifts returns shift history.
func (u *POSUsecase) ListShifts(ctx context.Context, tenantID uuid.UUID, outletID *uuid.UUID, status *string, limit int) ([]domain.CashierShift, error) {
	return u.repo.ListShifts(ctx, tenantID, outletID, status, limit)
}

// GetShiftReport generates an X-Report (audit snapshot) or Z-Report (closing summary).
func (u *POSUsecase) GetShiftReport(ctx context.Context, tenantID, shiftID uuid.UUID, reportType string, generatedBy string) (*domain.ShiftReportResponse, error) {
	if reportType != "X_REPORT" && reportType != "Z_REPORT" {
		reportType = "X_REPORT"
	}
	return u.repo.GetShiftReport(ctx, tenantID, shiftID, reportType, generatedBy)
}
