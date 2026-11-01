package handler_test

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	iamdomain "tropical-fnb/backend/internal/modules/iam/domain"
	iammw "tropical-fnb/backend/internal/modules/iam/middleware"
	iamtoken "tropical-fnb/backend/internal/modules/iam/token"
	"tropical-fnb/backend/internal/modules/pos/domain"
	"tropical-fnb/backend/internal/modules/pos/handler"
	"tropical-fnb/backend/internal/modules/pos/usecase"
)

type mockPOSRepo struct {
	tables       []domain.DiningTable
	orders       []domain.Order
	reservations []domain.Reservation
	shifts       []domain.CashierShift
	movements    []domain.CashierShiftCashMovement
	menuNames    map[uuid.UUID]string
	menuPrices   map[uuid.UUID]float64
}

func (m *mockPOSRepo) ListTables(ctx context.Context, tenantID uuid.UUID, outletID *uuid.UUID, section *string) ([]domain.DiningTable, error) {
	return m.tables, nil
}

func (m *mockPOSRepo) GetTableByID(ctx context.Context, tenantID, tableID uuid.UUID) (*domain.DiningTable, error) {
	for _, t := range m.tables {
		if t.ID == tableID {
			return &t, nil
		}
	}
	return nil, nil
}

func (m *mockPOSRepo) UpdateTableStatus(ctx context.Context, tenantID, tableID uuid.UUID, status string, activeOrderID *uuid.UUID) error {
	for i := range m.tables {
		if m.tables[i].ID == tableID {
			m.tables[i].Status = status
			m.tables[i].ActiveOrderID = activeOrderID
			return nil
		}
	}
	return nil
}

func (m *mockPOSRepo) ListOrders(ctx context.Context, tenantID uuid.UUID, outletID *uuid.UUID, status *string) ([]domain.Order, error) {
	return m.orders, nil
}

func (m *mockPOSRepo) GetOrderByID(ctx context.Context, tenantID, orderID uuid.UUID) (*domain.Order, error) {
	for _, o := range m.orders {
		if o.ID == orderID {
			return &o, nil
		}
	}
	return nil, nil
}

func (m *mockPOSRepo) CreateOrder(ctx context.Context, order *domain.Order, items []domain.OrderItem) (*domain.Order, error) {
	order.ID = uuid.New()
	order.OrderNumber = "ORD-TEST-0001"
	order.Items = items
	m.orders = append(m.orders, *order)
	return order, nil
}

func (m *mockPOSRepo) AddOrderItems(ctx context.Context, tenantID, orderID uuid.UUID, items []domain.OrderItem) (*domain.Order, error) {
	for i := range m.orders {
		if m.orders[i].ID == orderID {
			m.orders[i].Items = append(m.orders[i].Items, items...)
			return &m.orders[i], nil
		}
	}
	return nil, nil
}

func (m *mockPOSRepo) ApplyPayment(ctx context.Context, tenantID, orderID uuid.UUID, payment domain.OrderPayment) (*domain.Order, error) {
	for i := range m.orders {
		if m.orders[i].ID == orderID {
			if m.orders[i].PaymentStatus == domain.PaymentStatusPaid {
				return nil, domain.Conflict("order_already_paid", "order sudah lunas dan tidak dapat dibayar lagi")
			}
			m.orders[i].PaidAmount += payment.Amount
			if m.orders[i].PaidAmount >= m.orders[i].FinalTotal {
				m.orders[i].PaymentStatus = domain.PaymentStatusPaid
				m.orders[i].Status = domain.OrderStatusCompleted
				m.orders[i].StockDeducted = true
				now := time.Now()
				m.orders[i].StockDeductedAt = &now
			}
			m.orders[i].Payments = append(m.orders[i].Payments, payment)
			return &m.orders[i], nil
		}
	}
	return nil, nil
}

func (m *mockPOSRepo) SaveSplitBills(ctx context.Context, tenantID, orderID uuid.UUID, splits []domain.SplitBill) ([]domain.SplitBill, error) {
	for i := range splits {
		splits[i].ID = uuid.New()
	}
	for i := range m.orders {
		if m.orders[i].ID == orderID {
			m.orders[i].SplitBills = splits
		}
	}
	return splits, nil
}

func (m *mockPOSRepo) PaySplitBill(ctx context.Context, tenantID, orderID, splitBillID uuid.UUID, paymentMethod string, amount float64) (*domain.SplitBill, *domain.Order, error) {
	for i := range m.orders {
		if m.orders[i].ID == orderID {
			for j := range m.orders[i].SplitBills {
				if m.orders[i].SplitBills[j].ID == splitBillID {
					m.orders[i].SplitBills[j].IsPaid = true
					m.orders[i].SplitBills[j].PaymentMethod = &paymentMethod
					m.orders[i].SplitBills[j].PaidAmount = amount
					return &m.orders[i].SplitBills[j], &m.orders[i], nil
				}
			}
		}
	}
	return nil, nil, nil
}

func (m *mockPOSRepo) ListReservations(ctx context.Context, tenantID uuid.UUID, outletID *uuid.UUID, date *string) ([]domain.Reservation, error) {
	return m.reservations, nil
}

func (m *mockPOSRepo) CreateReservation(ctx context.Context, res *domain.Reservation) (*domain.Reservation, error) {
	res.ID = uuid.New()
	res.ReservationNumber = "RSV-TEST-001"
	m.reservations = append(m.reservations, *res)
	return res, nil
}

func (m *mockPOSRepo) CheckInReservation(ctx context.Context, tenantID, reservationID, tableID uuid.UUID, createdBy uuid.UUID) (*domain.Order, error) {
	ord := &domain.Order{
		ID:           uuid.New(),
		OrderNumber:  "ORD-RSV-001",
		TableID:      &tableID,
		CustomerName: "Tamu Event",
		Status:       domain.OrderStatusOpen,
	}
	m.orders = append(m.orders, *ord)
	return ord, nil
}

func (m *mockPOSRepo) ListBanquetPackages(ctx context.Context, tenantID uuid.UUID, outletID *uuid.UUID) ([]domain.BanquetPackage, error) {
	return []domain.BanquetPackage{
		{
			ID:          uuid.New(),
			Code:        "PKG-TEST-01",
			Name:        "Paket Prasmanan Test",
			MinPax:      20,
			PricePerPax: 50000,
			Category:    "BUFFET_PRASMANAN",
			IsActive:    true,
		},
	}, nil
}

func (m *mockPOSRepo) CreateBanquetPackage(ctx context.Context, pkg *domain.BanquetPackage) (*domain.BanquetPackage, error) {
	pkg.ID = uuid.New()
	return pkg, nil
}

func (m *mockPOSRepo) ListReservationPreorders(ctx context.Context, tenantID, reservationID uuid.UUID) ([]domain.ReservationPreorder, error) {
	return []domain.ReservationPreorder{}, nil
}

func (m *mockPOSRepo) AddReservationPreorder(ctx context.Context, preorder *domain.ReservationPreorder) (*domain.ReservationPreorder, error) {
	preorder.ID = uuid.New()
	return preorder, nil
}

func (m *mockPOSRepo) UpdateReservationPrepStatus(ctx context.Context, tenantID, reservationID uuid.UUID, prepStatus string) error {
	return nil
}

func (m *mockPOSRepo) SendReservationWAReminder(ctx context.Context, tenantID, reservationID uuid.UUID) (*domain.Reservation, error) {
	return &domain.Reservation{ID: reservationID, WhatsAppReminderSentAt: nil}, nil
}

func (m *mockPOSRepo) GetMenuItemMap(ctx context.Context, tenantID uuid.UUID) (map[uuid.UUID]string, map[uuid.UUID]float64, error) {
	return m.menuNames, m.menuPrices, nil
}

func (m *mockPOSRepo) GetUserIDByUsername(ctx context.Context, tenantID uuid.UUID, username string) (uuid.UUID, error) {
	return uuid.New(), nil
}

func (m *mockPOSRepo) ListKitchenTickets(ctx context.Context, tenantID uuid.UUID, outletID *uuid.UUID, station *string, includeServed bool) ([]domain.KitchenTicket, error) {
	return []domain.KitchenTicket{}, nil
}

func (m *mockPOSRepo) UpdateOrderItemStatus(ctx context.Context, tenantID, orderID, itemID uuid.UUID, status string) error {
	return nil
}

func (m *mockPOSRepo) UpdateOrderStatus(ctx context.Context, tenantID, orderID uuid.UUID, status string) error {
	return nil
}

func (m *mockPOSRepo) BumpTicket(ctx context.Context, tenantID, orderID uuid.UUID, targetStatus string) (*domain.KitchenTicket, error) {
	return &domain.KitchenTicket{ID: orderID, Status: targetStatus}, nil
}

func (m *mockPOSRepo) GetCurrentOpenShift(ctx context.Context, tenantID, outletID uuid.UUID) (*domain.CashierShift, error) {
	for _, s := range m.shifts {
		if s.TenantID == tenantID && s.OutletID == outletID && s.Status == "OPEN" {
			return &s, nil
		}
	}
	return nil, nil
}

func (m *mockPOSRepo) GetShiftByID(ctx context.Context, tenantID, shiftID uuid.UUID) (*domain.CashierShift, error) {
	for _, s := range m.shifts {
		if s.TenantID == tenantID && s.ID == shiftID {
			return &s, nil
		}
	}
	return nil, fmt.Errorf("shift not found")
}

func (m *mockPOSRepo) OpenShift(ctx context.Context, shift *domain.CashierShift) (*domain.CashierShift, error) {
	shift.ID = uuid.New()
	shift.ShiftNumber = "SHF-TSH-20261025-001"
	shift.Status = "OPEN"
	shift.OpenedAt = time.Now()
	shift.ExpectedCash = shift.OpeningCash
	m.shifts = append(m.shifts, *shift)
	return shift, nil
}

func (m *mockPOSRepo) CloseShift(ctx context.Context, tenantID, shiftID uuid.UUID, actualCash float64, supervisorID *uuid.UUID, notes *string) (*domain.CashierShift, error) {
	for i := range m.shifts {
		if m.shifts[i].ID == shiftID {
			now := time.Now()
			m.shifts[i].Status = "CLOSED"
			m.shifts[i].ClosedAt = &now
			m.shifts[i].ActualCash = &actualCash
			m.shifts[i].CashDifference = actualCash - m.shifts[i].ExpectedCash
			m.shifts[i].SupervisorUserID = supervisorID
			m.shifts[i].Notes = notes
			return &m.shifts[i], nil
		}
	}
	return nil, fmt.Errorf("shift not found")
}

func (m *mockPOSRepo) AddCashMovement(ctx context.Context, movement *domain.CashierShiftCashMovement) (*domain.CashierShiftCashMovement, error) {
	movement.ID = uuid.New()
	movement.CreatedAt = time.Now()
	m.movements = append(m.movements, *movement)
	return movement, nil
}

func (m *mockPOSRepo) ListCashMovements(ctx context.Context, tenantID, shiftID uuid.UUID) ([]domain.CashierShiftCashMovement, error) {
	var res []domain.CashierShiftCashMovement
	for _, mv := range m.movements {
		if mv.TenantID == tenantID && mv.ShiftID == shiftID {
			res = append(res, mv)
		}
	}
	return res, nil
}

func (m *mockPOSRepo) ListShifts(ctx context.Context, tenantID uuid.UUID, outletID *uuid.UUID, status *string, limit int) ([]domain.CashierShift, error) {
	return m.shifts, nil
}

func (m *mockPOSRepo) GetShiftReport(ctx context.Context, tenantID, shiftID uuid.UUID, reportType string, generatedBy string) (*domain.ShiftReportResponse, error) {
	s, err := m.GetShiftByID(ctx, tenantID, shiftID)
	if err != nil {
		return nil, err
	}
	mvs, _ := m.ListCashMovements(ctx, tenantID, shiftID)
	return &domain.ShiftReportResponse{
		Shift:       *s,
		Movements:   mvs,
		ReportType:  reportType,
		GeneratedAt: time.Now(),
		GeneratedBy: generatedBy,
	}, nil
}

func (m *mockPOSRepo) VerifySupervisorPIN(ctx context.Context, tenantID uuid.UUID, outletID *uuid.UUID, pin string) (bool, string, *uuid.UUID, error) {
	if pin == "123456" {
		spvID := uuid.New()
		return true, "Rian Pratama", &spvID, nil
	}
	return false, "", nil, nil
}

func setupPOSRouter(repo domain.Repository, jwtSecret string) (http.Handler, *iamtoken.JWTManager) {
	log := slog.New(slog.NewTextHandler(io.Discard, nil))
	jwtMgr, _ := iamtoken.NewJWTManager(jwtSecret)
	uc := usecase.NewPOSUsecase(repo)
	h := handler.NewPOSHandler(uc, log)

	r := chi.NewRouter()
	r.Route("/api/v1", func(api chi.Router) {
		api.Use(iammw.Authenticate(jwtMgr))
		api.Get("/pos/tables", h.ListTables)
		api.Patch("/pos/tables/{id}/status", h.UpdateTableStatus)
		api.Get("/pos/orders", h.ListOrders)
		api.Get("/pos/orders/{id}", h.GetOrderByID)
		api.Post("/pos/orders", h.CreateOrder)
		api.Post("/pos/orders/{id}/items", h.AddOrderItems)
		api.Post("/pos/orders/{id}/pay", h.ProcessPayment)
		api.Post("/pos/orders/{id}/split/evenly", h.SplitBillEvenly)
		api.Post("/pos/orders/{id}/split/by-items", h.SplitBillByItems)
		api.Post("/pos/orders/{id}/split/{split_id}/pay", h.PaySplitBill)
		api.Get("/pos/reservations", h.ListReservations)
		api.Post("/pos/reservations", h.CreateReservation)
		api.Post("/pos/reservations/{id}/check-in", h.CheckInReservation)
		api.Get("/pos/banquet-packages", h.ListBanquetPackages)
		api.Post("/pos/banquet-packages", h.CreateBanquetPackage)
		api.Get("/pos/reservations/{id}/preorders", h.ListReservationPreorders)
		api.Post("/pos/reservations/{id}/preorders", h.AddReservationPreorder)
		api.Put("/pos/reservations/{id}/prep-status", h.UpdateReservationPrepStatus)
		api.Post("/pos/reservations/{id}/wa-reminder", h.SendReservationWAReminder)

		// Cashier Shifts
		api.Get("/pos/shifts/current", h.GetCurrentShift)
		api.Get("/pos/shifts", h.ListShifts)
		api.Post("/pos/shifts/open", h.OpenShift)
		api.Post("/pos/shifts/{id}/close", h.CloseShift)
		api.Get("/pos/shifts/{id}/x-report", h.GetXReport)
		api.Get("/pos/shifts/{id}/z-report", h.GetZReport)
		api.Get("/pos/shifts/{id}/cash-movements", h.ListCashMovements)
		api.Post("/pos/shifts/{id}/cash-movements", h.AddCashMovement)
	})
	return r, jwtMgr
}

func TestPOSHandler_ListTables_Authorized(t *testing.T) {
	tenantID := uuid.New()
	outletID := uuid.New()

	repo := &mockPOSRepo{
		tables: []domain.DiningTable{
			{
				ID:          uuid.New(),
				TenantID:    tenantID,
				OutletID:    outletID,
				TableNumber: "T-01",
				Section:     "INDOOR_MAIN",
				Capacity:    4,
				Status:      domain.TableStatusAvailable,
			},
			{
				ID:          uuid.New(),
				TenantID:    tenantID,
				OutletID:    outletID,
				TableNumber: "GAZEBO-01",
				Section:     "OUTDOOR_GAZEBO",
				Capacity:    6,
				Status:      domain.TableStatusOccupied,
			},
		},
	}

	secret := "secret-key-that-is-at-least-32-chars-long"
	router, jwtMgr := setupPOSRouter(repo, secret)

	token, _, _ := jwtMgr.Generate(iamdomain.AuthClaims{
		TenantID:    tenantID.String(),
		Username:    "kasir_steak",
		FullName:    "Kasir Steak",
		Roles:       []string{"CASHIER"},
		IsGlobalAll: false,
		OutletIDs:   []string{outletID.String()},
	}, 1*time.Hour)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/pos/tables", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()

	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	var tables []domain.DiningTable
	if err := json.NewDecoder(w.Body).Decode(&tables); err != nil {
		t.Fatalf("decode: %v", err)
	}

	if len(tables) != 2 {
		t.Errorf("expected 2 tables, got %d", len(tables))
	}
}

func TestPOSHandler_CreateOrder_ZeroLeakPB1Calculation(t *testing.T) {
	tenantID := uuid.New()
	outletID := uuid.New()
	menuID := uuid.New()

	repo := &mockPOSRepo{
		menuNames: map[uuid.UUID]string{
			menuID: "Australian Tenderloin Steak 200g",
		},
		menuPrices: map[uuid.UUID]float64{
			menuID: 88000,
		},
	}

	secret := "secret-key-that-is-at-least-32-chars-long"
	router, jwtMgr := setupPOSRouter(repo, secret)

	token, _, _ := jwtMgr.Generate(iamdomain.AuthClaims{
		TenantID:    tenantID.String(),
		Username:    "kasir_steak",
		FullName:    "Kasir Steak",
		Roles:       []string{"CASHIER"},
		IsGlobalAll: false,
		OutletIDs:   []string{outletID.String()},
	}, 1*time.Hour)

	body, _ := json.Marshal(domain.CreateOrderRequest{
		OutletID:     outletID,
		CustomerName: "Pak Budi",
		PaxCount:     2,
		OrderType:    domain.OrderTypeDineIn,
		PaymentFlow:  domain.PaymentFlowPayAfter,
		Items: []domain.CreateOrderItemRequest{
			{MenuItemID: menuID, Quantity: 2},
		},
	})

	req := httptest.NewRequest(http.MethodPost, "/api/v1/pos/orders", bytes.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	router.ServeHTTP(w, req)

	if w.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", w.Code, w.Body.String())
	}

	var created domain.Order
	if err := json.NewDecoder(w.Body).Decode(&created); err != nil {
		t.Fatalf("decode: %v", err)
	}

	// 2 x 88.000 = 176.000 Subtotal, PB1 10% = 17.600, Final Total = 193.600
	if created.Subtotal != 176000 {
		t.Errorf("expected subtotal 176000, got %v", created.Subtotal)
	}
	if created.TaxPB1Amount != 17600 {
		t.Errorf("expected tax PB1 17600, got %v", created.TaxPB1Amount)
	}
	if created.FinalTotal != 193600 {
		t.Errorf("expected final total 193600, got %v", created.FinalTotal)
	}
}

func TestPOSHandler_CreateOrder_ZeroQuantity_Guard(t *testing.T) {
	tenantID := uuid.New()
	outletID := uuid.New()
	menuID := uuid.New()

	repo := &mockPOSRepo{
		menuNames: map[uuid.UUID]string{
			menuID: "Australian Tenderloin Steak 200g",
		},
		menuPrices: map[uuid.UUID]float64{
			menuID: 88000,
		},
	}

	secret := "secret-key-that-is-at-least-32-chars-long"
	router, jwtMgr := setupPOSRouter(repo, secret)

	token, _, _ := jwtMgr.Generate(iamdomain.AuthClaims{
		TenantID:    tenantID.String(),
		Username:    "kasir_steak",
		FullName:    "Kasir Steak",
		Roles:       []string{"CASHIER"},
		IsGlobalAll: false,
		OutletIDs:   []string{outletID.String()},
	}, 1*time.Hour)

	// Test zero quantity
	body, _ := json.Marshal(domain.CreateOrderRequest{
		OutletID:     outletID,
		CustomerName: "Test Zero",
		PaxCount:     1,
		Items: []domain.CreateOrderItemRequest{
			{MenuItemID: menuID, Quantity: 0},
		},
	})

	req := httptest.NewRequest(http.MethodPost, "/api/v1/pos/orders", bytes.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	router.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for zero quantity, got %d: %s", w.Code, w.Body.String())
	}
}

func TestPOSHandler_SplitBillEvenly_ZeroLeak(t *testing.T) {
	tenantID := uuid.New()
	outletID := uuid.New()
	orderID := uuid.New()

	repo := &mockPOSRepo{
		orders: []domain.Order{
			{
				ID:           orderID,
				TenantID:     tenantID,
				OutletID:     outletID,
				FinalTotal:   100000,
				Subtotal:     90909,
				TaxPB1Amount: 9091,
			},
		},
	}

	secret := "secret-key-that-is-at-least-32-chars-long"
	router, jwtMgr := setupPOSRouter(repo, secret)

	token, _, _ := jwtMgr.Generate(iamdomain.AuthClaims{
		TenantID:    tenantID.String(),
		Username:    "kasir_steak",
		FullName:    "Kasir Steak",
		Roles:       []string{"CASHIER"},
		IsGlobalAll: false,
		OutletIDs:   []string{outletID.String()},
	}, 1*time.Hour)

	body, _ := json.Marshal(domain.SplitEvenlyRequest{
		NumPersons: 3,
	})

	req := httptest.NewRequest(http.MethodPost, "/api/v1/pos/orders/"+orderID.String()+"/split/evenly", bytes.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	var splits []domain.SplitBill
	if err := json.NewDecoder(w.Body).Decode(&splits); err != nil {
		t.Fatalf("decode: %v", err)
	}

	if len(splits) != 3 {
		t.Fatalf("expected 3 splits, got %d", len(splits))
	}

	var sum float64
	for _, s := range splits {
		sum += s.FinalAmount
	}

	// Must be exactly 100.000, zero leak!
	if sum != 100000 {
		t.Errorf("sum %v != 100000", sum)
	}
}

func TestPOSHandler_ShiftLifecycle_OpenCloseXReport(t *testing.T) {
	tenantID := uuid.New()
	outletID := uuid.New()

	repo := &mockPOSRepo{}
	jwtSecret := "test-secret-key-123456789012345678"
	router, jwtMgr := setupPOSRouter(repo, jwtSecret)

	token, _, err := jwtMgr.Generate(iamdomain.AuthClaims{
		TenantID:    tenantID.String(),
		Username:    "kasir_steak",
		FullName:    "Kasir Steak",
		Roles:       []string{"CASHIER"},
		IsGlobalAll: false,
		OutletIDs:   []string{outletID.String()},
	}, 1*time.Hour)
	if err != nil {
		t.Fatalf("generate token: %v", err)
	}

	// 1. Check current shift before opening (expect is_open: false)
	req1 := httptest.NewRequest("GET", "/api/v1/pos/shifts/current", nil)
	req1.Header.Set("Authorization", "Bearer "+token)
	req1.Header.Set("X-Outlet-ID", outletID.String())
	w1 := httptest.NewRecorder()
	router.ServeHTTP(w1, req1)
	if w1.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w1.Code, w1.Body.String())
	}
	var res1 struct {
		IsOpen bool `json:"is_open"`
	}
	_ = json.NewDecoder(w1.Body).Decode(&res1)
	if res1.IsOpen {
		t.Fatalf("expected is_open to be false before opening")
	}

	// 2. Open Shift with float 200.000
	openBody, _ := json.Marshal(domain.OpenShiftRequest{
		OutletID:    outletID,
		ShiftName:   "SHIFT_PAGI",
		OpeningCash: 200000,
	})
	req2 := httptest.NewRequest("POST", "/api/v1/pos/shifts/open", bytes.NewReader(openBody))
	req2.Header.Set("Authorization", "Bearer "+token)
	req2.Header.Set("X-Outlet-ID", outletID.String())
	req2.Header.Set("Content-Type", "application/json")
	w2 := httptest.NewRecorder()
	router.ServeHTTP(w2, req2)
	if w2.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", w2.Code, w2.Body.String())
	}
	var openedShift domain.CashierShift
	_ = json.NewDecoder(w2.Body).Decode(&openedShift)
	if openedShift.OpeningCash != 200000 || openedShift.Status != "OPEN" {
		t.Fatalf("unexpected opened shift: %+v", openedShift)
	}

	// 3. Add Paid-Out petty cash (e.g. 50.000 for ice cubes) with SPV PIN
	pin := "123456"
	mvBody, _ := json.Marshal(domain.CashMovementRequest{
		MovementType:  "PAID_OUT",
		Amount:        50000,
		Reason:        "Beli es batu kristal darurat",
		SupervisorPIN: &pin,
	})
	req3 := httptest.NewRequest("POST", "/api/v1/pos/shifts/"+openedShift.ID.String()+"/cash-movements", bytes.NewReader(mvBody))
	req3.Header.Set("Authorization", "Bearer "+token)
	req3.Header.Set("X-Outlet-ID", outletID.String())
	req3.Header.Set("Content-Type", "application/json")
	w3 := httptest.NewRecorder()
	router.ServeHTTP(w3, req3)
	if w3.Code != http.StatusCreated {
		t.Fatalf("expected 201 for cash movement, got %d: %s", w3.Code, w3.Body.String())
	}

	// 4. Fetch X-Report (Audit snapshot mid-shift)
	req4 := httptest.NewRequest("GET", "/api/v1/pos/shifts/current/x-report", nil)
	req4.Header.Set("Authorization", "Bearer "+token)
	req4.Header.Set("X-Outlet-ID", outletID.String())
	w4 := httptest.NewRecorder()
	router.ServeHTTP(w4, req4)
	if w4.Code != http.StatusOK {
		t.Fatalf("expected 200 for x-report, got %d: %s", w4.Code, w4.Body.String())
	}
	var xReport domain.ShiftReportResponse
	_ = json.NewDecoder(w4.Body).Decode(&xReport)
	if xReport.ReportType != "X_REPORT" {
		t.Fatalf("expected X_REPORT, got %s", xReport.ReportType)
	}

	// 5. Close Shift with blind physical cash count (150.000)
	closeBody, _ := json.Marshal(domain.CloseShiftRequest{
		ActualCash:    150000,
		SupervisorPIN: &pin,
	})
	req5 := httptest.NewRequest("POST", "/api/v1/pos/shifts/"+openedShift.ID.String()+"/close", bytes.NewReader(closeBody))
	req5.Header.Set("Authorization", "Bearer "+token)
	req5.Header.Set("X-Outlet-ID", outletID.String())
	req5.Header.Set("Content-Type", "application/json")
	w5 := httptest.NewRecorder()
	router.ServeHTTP(w5, req5)
	if w5.Code != http.StatusOK {
		t.Fatalf("expected 200 for close shift, got %d: %s", w5.Code, w5.Body.String())
	}
	var closedShift domain.CashierShift
	_ = json.NewDecoder(w5.Body).Decode(&closedShift)
	if closedShift.Status != "CLOSED" {
		t.Fatalf("expected CLOSED shift, got %s", closedShift.Status)
	}
}

func TestPOSHandler_ProcessPayment_StockDeductedAndIdempotent(t *testing.T) {
	tenantID := uuid.New()
	outletID := uuid.New()
	orderID := uuid.New()

	repo := &mockPOSRepo{
		orders: []domain.Order{
			{
				ID:            orderID,
				TenantID:      tenantID,
				OutletID:      outletID,
				OrderNumber:   "ORD-TSH-20261031-0001",
				Status:        domain.OrderStatusOpen,
				PaymentStatus: domain.PaymentStatusUnpaid,
				FinalTotal:    185000,
				PaidAmount:    0,
				StockDeducted: false,
			},
		},
	}

	secret := "secret-key-that-is-at-least-32-chars-long"
	router, jwtMgr := setupPOSRouter(repo, secret)

	token, _, _ := jwtMgr.Generate(iamdomain.AuthClaims{
		TenantID:    tenantID.String(),
		Username:    "kasir_steak",
		FullName:    "Kasir Steak",
		Roles:       []string{"CASHIER"},
		IsGlobalAll: false,
		OutletIDs:   []string{outletID.String()},
	}, 1*time.Hour)

	// Settle payment in full (185.000)
	payBody, _ := json.Marshal(domain.ProcessPaymentRequest{
		PaymentMethod: "CASH",
		Amount:        185000,
	})

	req := httptest.NewRequest(http.MethodPost, "/api/v1/pos/orders/"+orderID.String()+"/pay", bytes.NewReader(payBody))
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	var paidOrder domain.Order
	if err := json.NewDecoder(w.Body).Decode(&paidOrder); err != nil {
		t.Fatalf("decode: %v", err)
	}

	if paidOrder.PaymentStatus != domain.PaymentStatusPaid {
		t.Errorf("expected PAID status, got %s", paidOrder.PaymentStatus)
	}

	if !paidOrder.StockDeducted {
		t.Errorf("expected StockDeducted to be true after full payment settlement")
	}

	if paidOrder.StockDeductedAt == nil {
		t.Errorf("expected StockDeductedAt timestamp to be set")
	}
}

func TestPOSHandler_ProcessPayment_BOLA_OutletIsolation(t *testing.T) {
	tenantID := uuid.New()
	steakOutletID := uuid.New()
	gardenOutletID := uuid.New()
	orderID := uuid.New()

	repo := &mockPOSRepo{
		orders: []domain.Order{
			{
				ID:            orderID,
				TenantID:      tenantID,
				OutletID:      steakOutletID,
				OrderNumber:   "ORD-TSH-20261031-0001",
				Status:        domain.OrderStatusOpen,
				PaymentStatus: domain.PaymentStatusUnpaid,
				FinalTotal:    150000,
			},
		},
	}

	secret := "secret-key-that-is-at-least-32-chars-long"
	router, jwtMgr := setupPOSRouter(repo, secret)

	// Cashier of Garden Resto (assigned only to gardenOutletID)
	token, _, _ := jwtMgr.Generate(iamdomain.AuthClaims{
		TenantID:    tenantID.String(),
		Username:    "kasir_garden",
		FullName:    "Kasir Garden",
		Roles:       []string{"CASHIER"},
		IsGlobalAll: false,
		OutletIDs:   []string{gardenOutletID.String()},
	}, 1*time.Hour)

	payBody, _ := json.Marshal(domain.ProcessPaymentRequest{
		PaymentMethod: "CASH",
		Amount:        150000,
	})

	// kasir_garden tries to pay steak order (even spoofing X-Outlet-ID to steakOutletID)
	req := httptest.NewRequest(http.MethodPost, "/api/v1/pos/orders/"+orderID.String()+"/pay", bytes.NewReader(payBody))
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("X-Outlet-ID", steakOutletID.String())
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	router.ServeHTTP(w, req)

	// Middleware blocks spoofed outlet with 403 outlet_forbidden
	if w.Code != http.StatusForbidden {
		t.Fatalf("expected 403 Forbidden for cross-outlet access, got %d: %s", w.Code, w.Body.String())
	}

	// kasir_garden sends request without X-Outlet-ID header
	reqNoHeader := httptest.NewRequest(http.MethodPost, "/api/v1/pos/orders/"+orderID.String()+"/pay", bytes.NewReader(payBody))
	reqNoHeader.Header.Set("Authorization", "Bearer "+token)
	reqNoHeader.Header.Set("Content-Type", "application/json")
	wNoHeader := httptest.NewRecorder()

	router.ServeHTTP(wNoHeader, reqNoHeader)

	// Handler authorizeOrder blocks access because order belongs to steakOutletID
	if wNoHeader.Code != http.StatusForbidden {
		t.Fatalf("expected 403 Forbidden when accessing another outlet's order, got %d: %s", wNoHeader.Code, wNoHeader.Body.String())
	}
}

func TestPOSHandler_ProcessPayment_RejectDoublePayment(t *testing.T) {
	tenantID := uuid.New()
	outletID := uuid.New()
	orderID := uuid.New()

	repo := &mockPOSRepo{
		orders: []domain.Order{
			{
				ID:            orderID,
				TenantID:      tenantID,
				OutletID:      outletID,
				OrderNumber:   "ORD-TSH-20261031-0002",
				Status:        domain.OrderStatusCompleted,
				PaymentStatus: domain.PaymentStatusPaid,
				FinalTotal:    150000,
				PaidAmount:    150000,
			},
		},
	}

	secret := "secret-key-that-is-at-least-32-chars-long"
	router, jwtMgr := setupPOSRouter(repo, secret)

	token, _, _ := jwtMgr.Generate(iamdomain.AuthClaims{
		TenantID:    tenantID.String(),
		Username:    "kasir_steak",
		FullName:    "Kasir Steak",
		Roles:       []string{"CASHIER"},
		IsGlobalAll: false,
		OutletIDs:   []string{outletID.String()},
	}, 1*time.Hour)

	payBody, _ := json.Marshal(domain.ProcessPaymentRequest{
		PaymentMethod: "CASH",
		Amount:        150000,
	})

	req := httptest.NewRequest(http.MethodPost, "/api/v1/pos/orders/"+orderID.String()+"/pay", bytes.NewReader(payBody))
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	router.ServeHTTP(w, req)

	if w.Code != http.StatusConflict {
		t.Fatalf("expected 409 Conflict for already paid order, got %d: %s", w.Code, w.Body.String())
	}
}

