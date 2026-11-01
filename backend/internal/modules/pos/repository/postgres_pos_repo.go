// Package repository provides PostgreSQL persistence for POS orders, tables, split bills, and reservations.
package repository

import (
	"context"
	"errors"
	"fmt"
	"math"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"golang.org/x/crypto/bcrypt"

	"tropical-fnb/backend/internal/modules/pos/domain"
	"tropical-fnb/backend/internal/platform/currency"
	"tropical-fnb/backend/internal/platform/database"
)

// PostgresPOSRepository implements domain.Repository.
type PostgresPOSRepository struct {
	txMgr *database.TxManager
}

// NewPostgresPOSRepository creates a new POS repository.
func NewPostgresPOSRepository(txMgr *database.TxManager) *PostgresPOSRepository {
	return &PostgresPOSRepository{txMgr: txMgr}
}

// ListTables retrieves dining tables and gazebos for the specified outlet.
func (r *PostgresPOSRepository) ListTables(ctx context.Context, tenantID uuid.UUID, outletID *uuid.UUID, section *string) ([]domain.DiningTable, error) {
	query := `
		SELECT 
			t.id, t.tenant_id, t.outlet_id, o.code AS outlet_code,
			t.table_number, t.section, t.capacity, t.shape, t.status,
			t.active_order_id, ord.order_number AS active_order_number,
			ord.customer_name AS active_customer_name,
			ord.final_total AS active_order_total,
			t.pos_x, t.pos_y, t.created_at, t.updated_at
		FROM dining_tables t
		JOIN outlets o ON o.id = t.outlet_id
		LEFT JOIN orders ord ON ord.id = t.active_order_id AND ord.deleted_at IS NULL
		WHERE t.tenant_id = $1 AND t.deleted_at IS NULL
		  AND ($2::UUID IS NULL OR t.outlet_id = $2)
		  AND ($3::TEXT IS NULL OR t.section = $3)
		ORDER BY t.section ASC, t.table_number ASC
	`

	rows, err := r.txMgr.Conn(ctx).Query(ctx, query, tenantID, outletID, section)
	if err != nil {
		return nil, fmt.Errorf("list dining tables: %w", err)
	}
	defer rows.Close()

	tables := make([]domain.DiningTable, 0)
	for rows.Next() {
		var dt domain.DiningTable
		if err := rows.Scan(
			&dt.ID,
			&dt.TenantID,
			&dt.OutletID,
			&dt.OutletCode,
			&dt.TableNumber,
			&dt.Section,
			&dt.Capacity,
			&dt.Shape,
			&dt.Status,
			&dt.ActiveOrderID,
			&dt.ActiveOrderNumber,
			&dt.ActiveCustomerName,
			&dt.ActiveOrderTotal,
			&dt.PosX,
			&dt.PosY,
			&dt.CreatedAt,
			&dt.UpdatedAt,
		); err != nil {
			return nil, fmt.Errorf("scan dining table: %w", err)
		}
		tables = append(tables, dt)
	}
	return tables, nil
}

// GetTableByID returns a single table by ID.
func (r *PostgresPOSRepository) GetTableByID(ctx context.Context, tenantID, tableID uuid.UUID) (*domain.DiningTable, error) {
	query := `
		SELECT 
			t.id, t.tenant_id, t.outlet_id, o.code AS outlet_code,
			t.table_number, t.section, t.capacity, t.shape, t.status,
			t.active_order_id, ord.order_number AS active_order_number,
			ord.customer_name AS active_customer_name,
			ord.final_total AS active_order_total,
			t.pos_x, t.pos_y, t.created_at, t.updated_at
		FROM dining_tables t
		JOIN outlets o ON o.id = t.outlet_id
		LEFT JOIN orders ord ON ord.id = t.active_order_id AND ord.deleted_at IS NULL
		WHERE t.tenant_id = $1 AND t.id = $2 AND t.deleted_at IS NULL
	`

	var dt domain.DiningTable
	err := r.txMgr.Conn(ctx).QueryRow(ctx, query, tenantID, tableID).Scan(
		&dt.ID,
		&dt.TenantID,
		&dt.OutletID,
		&dt.OutletCode,
		&dt.TableNumber,
		&dt.Section,
		&dt.Capacity,
		&dt.Shape,
		&dt.Status,
		&dt.ActiveOrderID,
		&dt.ActiveOrderNumber,
		&dt.ActiveCustomerName,
		&dt.ActiveOrderTotal,
		&dt.PosX,
		&dt.PosY,
		&dt.CreatedAt,
		&dt.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, domain.NotFound("table not found")
		}
		return nil, fmt.Errorf("get table by id: %w", err)
	}
	return &dt, nil
}

// UpdateTableStatus updates the status and active order of a dining table.
func (r *PostgresPOSRepository) UpdateTableStatus(ctx context.Context, tenantID, tableID uuid.UUID, status string, activeOrderID *uuid.UUID) error {
	query := `
		UPDATE dining_tables
		SET status = $3, active_order_id = $4, updated_at = now()
		WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL
	`
	tag, err := r.txMgr.Conn(ctx).Exec(ctx, query, tenantID, tableID, status, activeOrderID)
	if err != nil {
		return fmt.Errorf("update table status: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return domain.NotFound("table not found or already deleted")
	}
	return nil
}

// ListOrders returns recent orders for an outlet.
func (r *PostgresPOSRepository) ListOrders(ctx context.Context, tenantID uuid.UUID, outletID *uuid.UUID, status *string) ([]domain.Order, error) {
	query := `
		SELECT 
			o.id, o.tenant_id, o.outlet_id, ot.code AS outlet_code,
			o.order_number, o.order_type, o.payment_flow,
			o.table_id, dt.table_number,
			o.customer_name, o.customer_phone, o.pax_count,
			o.status, o.payment_status,
			o.subtotal, o.discount_amount, o.discount_note,
			o.tax_pb1_percent, o.tax_pb1_amount,
			o.service_charge_percent, o.service_charge_amount,
			o.final_total, o.paid_amount, o.change_amount,
			o.notes, o.created_by, u.full_name AS created_by_name,
			o.created_at, o.updated_at, o.closed_at, o.shift_id,
			o.stock_deducted, o.stock_deducted_at
		FROM orders o
		JOIN outlets ot ON ot.id = o.outlet_id
		LEFT JOIN dining_tables dt ON dt.id = o.table_id
		LEFT JOIN users u ON u.id = o.created_by
		WHERE o.tenant_id = $1 AND o.deleted_at IS NULL
		  AND ($2::UUID IS NULL OR o.outlet_id = $2)
		  AND ($3::TEXT IS NULL OR o.status = $3)
		ORDER BY o.created_at DESC
		LIMIT 50
	`

	rows, err := r.txMgr.Conn(ctx).Query(ctx, query, tenantID, outletID, status)
	if err != nil {
		return nil, fmt.Errorf("list orders: %w", err)
	}
	defer rows.Close()

	orders := make([]domain.Order, 0)
	for rows.Next() {
		var ord domain.Order
		if err := rows.Scan(
			&ord.ID,
			&ord.TenantID,
			&ord.OutletID,
			&ord.OutletCode,
			&ord.OrderNumber,
			&ord.OrderType,
			&ord.PaymentFlow,
			&ord.TableID,
			&ord.TableNumber,
			&ord.CustomerName,
			&ord.CustomerPhone,
			&ord.PaxCount,
			&ord.Status,
			&ord.PaymentStatus,
			&ord.Subtotal,
			&ord.DiscountAmount,
			&ord.DiscountNote,
			&ord.TaxPB1Percent,
			&ord.TaxPB1Amount,
			&ord.ServiceChargePercent,
			&ord.ServiceChargeAmount,
			&ord.FinalTotal,
			&ord.PaidAmount,
			&ord.ChangeAmount,
			&ord.Notes,
			&ord.CreatedBy,
			&ord.CreatedByName,
			&ord.CreatedAt,
			&ord.UpdatedAt,
			&ord.ClosedAt,
			&ord.ShiftID,
			&ord.StockDeducted,
			&ord.StockDeductedAt,
		); err != nil {
			return nil, fmt.Errorf("scan order: %w", err)
		}
		orders = append(orders, ord)
	}
	return orders, nil
}

// GetOrderByID loads a complete order including items, payments, and split bills.
func (r *PostgresPOSRepository) GetOrderByID(ctx context.Context, tenantID, orderID uuid.UUID) (*domain.Order, error) {
	orderQuery := `
		SELECT 
			o.id, o.tenant_id, o.outlet_id, ot.code AS outlet_code,
			o.order_number, o.order_type, o.payment_flow,
			o.table_id, dt.table_number,
			o.customer_name, o.customer_phone, o.pax_count,
			o.status, o.payment_status,
			o.subtotal, o.discount_amount, o.discount_note,
			o.tax_pb1_percent, o.tax_pb1_amount,
			o.service_charge_percent, o.service_charge_amount,
			o.final_total, o.paid_amount, o.change_amount,
			o.notes, o.created_by, u.full_name AS created_by_name,
			o.created_at, o.updated_at, o.closed_at, o.shift_id,
			o.stock_deducted, o.stock_deducted_at
		FROM orders o
		JOIN outlets ot ON ot.id = o.outlet_id
		LEFT JOIN dining_tables dt ON dt.id = o.table_id
		LEFT JOIN users u ON u.id = o.created_by
		WHERE o.tenant_id = $1 AND o.id = $2 AND o.deleted_at IS NULL
	`

	var ord domain.Order
	err := r.txMgr.Conn(ctx).QueryRow(ctx, orderQuery, tenantID, orderID).Scan(
		&ord.ID,
		&ord.TenantID,
		&ord.OutletID,
		&ord.OutletCode,
		&ord.OrderNumber,
		&ord.OrderType,
		&ord.PaymentFlow,
		&ord.TableID,
		&ord.TableNumber,
		&ord.CustomerName,
		&ord.CustomerPhone,
		&ord.PaxCount,
		&ord.Status,
		&ord.PaymentStatus,
		&ord.Subtotal,
		&ord.DiscountAmount,
		&ord.DiscountNote,
		&ord.TaxPB1Percent,
		&ord.TaxPB1Amount,
		&ord.ServiceChargePercent,
		&ord.ServiceChargeAmount,
		&ord.FinalTotal,
		&ord.PaidAmount,
		&ord.ChangeAmount,
		&ord.Notes,
		&ord.CreatedBy,
		&ord.CreatedByName,
		&ord.CreatedAt,
		&ord.UpdatedAt,
		&ord.ClosedAt,
		&ord.ShiftID,
		&ord.StockDeducted,
		&ord.StockDeductedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, domain.NotFound("order not found")
		}
		return nil, fmt.Errorf("get order by id: %w", err)
	}

	// Load Items
	itemsQuery := `
		SELECT id, order_id, menu_item_id, item_name, unit_price, quantity, subtotal, notes, status, created_at, updated_at
		FROM order_items
		WHERE order_id = $1
		ORDER BY created_at ASC
	`
	rows, err := r.txMgr.Conn(ctx).Query(ctx, itemsQuery, orderID)
	if err != nil {
		return nil, fmt.Errorf("load order items: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var it domain.OrderItem
		if err := rows.Scan(
			&it.ID,
			&it.OrderID,
			&it.MenuItemID,
			&it.ItemName,
			&it.UnitPrice,
			&it.Quantity,
			&it.Subtotal,
			&it.Notes,
			&it.Status,
			&it.CreatedAt,
			&it.UpdatedAt,
		); err != nil {
			return nil, fmt.Errorf("scan order item: %w", err)
		}
		ord.Items = append(ord.Items, it)
	}

	// Load Payments
	paymentsQuery := `
		SELECT id, order_id, payment_method, amount, change_given, reference_number, paid_by, paid_at
		FROM order_payments
		WHERE order_id = $1
		ORDER BY paid_at ASC
	`
	pRows, err := r.txMgr.Conn(ctx).Query(ctx, paymentsQuery, orderID)
	if err != nil {
		return nil, fmt.Errorf("load order payments: %w", err)
	}
	defer pRows.Close()

	for pRows.Next() {
		var p domain.OrderPayment
		if err := pRows.Scan(
			&p.ID,
			&p.OrderID,
			&p.PaymentMethod,
			&p.Amount,
			&p.ChangeGiven,
			&p.ReferenceNumber,
			&p.PaidBy,
			&p.PaidAt,
		); err != nil {
			return nil, fmt.Errorf("scan order payment: %w", err)
		}
		ord.Payments = append(ord.Payments, p)
	}

	// Load Split Bills
	splitsQuery := `
		SELECT id, order_id, split_number, payer_name, subtotal, tax_pb1_amount, final_amount, paid_amount, payment_method, is_paid, paid_at, created_at
		FROM split_bills
		WHERE order_id = $1
		ORDER BY split_number ASC
	`
	sRows, err := r.txMgr.Conn(ctx).Query(ctx, splitsQuery, orderID)
	if err != nil {
		return nil, fmt.Errorf("load split bills: %w", err)
	}
	defer sRows.Close()

	for sRows.Next() {
		var sb domain.SplitBill
		if err := sRows.Scan(
			&sb.ID,
			&sb.OrderID,
			&sb.SplitNumber,
			&sb.PayerName,
			&sb.Subtotal,
			&sb.TaxPB1Amount,
			&sb.FinalAmount,
			&sb.PaidAmount,
			&sb.PaymentMethod,
			&sb.IsPaid,
			&sb.PaidAt,
			&sb.CreatedAt,
		); err != nil {
			return nil, fmt.Errorf("scan split bill: %w", err)
		}
		ord.SplitBills = append(ord.SplitBills, sb)
	}

	return &ord, nil
}

// CreateOrder inserts a new order with items and updates dining table status atomically.
func (r *PostgresPOSRepository) CreateOrder(ctx context.Context, order *domain.Order, items []domain.OrderItem) (*domain.Order, error) {
	var createdOrder *domain.Order

	err := r.txMgr.WithTx(ctx, func(txCtx context.Context) error {
		// 1. Acquire transaction advisory lock to guarantee serialized, collision-free order numbering
		lockQuery := `SELECT pg_advisory_xact_lock(hashtext('order_seq_' || $1::text || '_' || $2::text || '_' || CURRENT_DATE::text))`
		if _, err := r.txMgr.Conn(txCtx).Exec(txCtx, lockQuery, order.TenantID, order.OutletID); err != nil {
			return fmt.Errorf("acquire order sequence lock: %w", err)
		}

		// 2. Resolve outlet code
		var outletCode string
		if err := r.txMgr.Conn(txCtx).QueryRow(txCtx, `SELECT code FROM outlets WHERE id = $1`, order.OutletID).Scan(&outletCode); err != nil {
			return fmt.Errorf("get outlet code: %w", err)
		}

		// 3. Find highest existing sequence for this outlet and date (monotonic, immune to deletions or race conditions)
		var maxSeq int
		dateStr := time.Now().Format("20060102")
		seqQuery := `
			SELECT COALESCE(MAX(SUBSTRING(order_number FROM '(\d+)$')::int), 0)
			FROM orders
			WHERE tenant_id = $1 AND outlet_id = $2 AND DATE(created_at) = CURRENT_DATE
		`
		if err := r.txMgr.Conn(txCtx).QueryRow(txCtx, seqQuery, order.TenantID, order.OutletID).Scan(&maxSeq); err != nil {
			return fmt.Errorf("find max daily order sequence: %w", err)
		}

		order.OrderNumber = fmt.Sprintf("ORD-%s-%s-%04d", outletCode, dateStr, maxSeq+1)

		// Link order to active open shift for this outlet if not explicitly set
		if order.ShiftID == nil {
			var activeShiftID uuid.UUID
			if err := r.txMgr.Conn(txCtx).QueryRow(txCtx, `
				SELECT id FROM cashier_shifts
				WHERE tenant_id = $1 AND outlet_id = $2 AND status = 'OPEN' AND deleted_at IS NULL
				ORDER BY opened_at DESC LIMIT 1
			`, order.TenantID, order.OutletID).Scan(&activeShiftID); err == nil {
				order.ShiftID = &activeShiftID
			}
		}

		insertOrderQuery := `
			INSERT INTO orders (
				tenant_id, outlet_id, order_number, order_type, payment_flow,
				table_id, customer_name, customer_phone, pax_count,
				status, payment_status, subtotal, discount_amount, discount_note,
				tax_pb1_percent, tax_pb1_amount, service_charge_percent, service_charge_amount,
				final_total, paid_amount, change_amount, notes, created_by, shift_id
			) VALUES (
				$1, $2, $3, $4, $5,
				$6, $7, $8, $9,
				$10, $11, $12, $13, $14,
				$15, $16, $17, $18,
				$19, $20, $21, $22, $23, $24
			) RETURNING id, created_at, updated_at
		`

		err := r.txMgr.Conn(txCtx).QueryRow(txCtx, insertOrderQuery,
			order.TenantID, order.OutletID, order.OrderNumber, order.OrderType, order.PaymentFlow,
			order.TableID, order.CustomerName, order.CustomerPhone, order.PaxCount,
			order.Status, order.PaymentStatus, order.Subtotal, order.DiscountAmount, order.DiscountNote,
			order.TaxPB1Percent, order.TaxPB1Amount, order.ServiceChargePercent, order.ServiceChargeAmount,
			order.FinalTotal, order.PaidAmount, order.ChangeAmount, order.Notes, order.CreatedBy, order.ShiftID,
		).Scan(&order.ID, &order.CreatedAt, &order.UpdatedAt)
		if err != nil {
			return fmt.Errorf("insert order: %w", err)
		}

		// Insert Items
		insertItemQuery := `
			INSERT INTO order_items (order_id, menu_item_id, item_name, unit_price, quantity, subtotal, notes, status)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
			RETURNING id, created_at, updated_at
		`
		for i := range items {
			items[i].OrderID = order.ID
			err := r.txMgr.Conn(txCtx).QueryRow(txCtx, insertItemQuery,
				order.ID, items[i].MenuItemID, items[i].ItemName, items[i].UnitPrice,
				items[i].Quantity, items[i].Subtotal, items[i].Notes, items[i].Status,
			).Scan(&items[i].ID, &items[i].CreatedAt, &items[i].UpdatedAt)
			if err != nil {
				return fmt.Errorf("insert order item %s: %w", items[i].ItemName, err)
			}
		}

		// Update Table Status if DINE_IN
		if order.TableID != nil {
			tableUpdateQuery := `
				UPDATE dining_tables 
				SET status = 'OCCUPIED', active_order_id = $1, updated_at = now()
				WHERE id = $2
			`
			if _, err := r.txMgr.Conn(txCtx).Exec(txCtx, tableUpdateQuery, order.ID, *order.TableID); err != nil {
				return fmt.Errorf("update table status to occupied: %w", err)
			}
		}

		order.Items = items
		createdOrder = order

		// Auto-deduct inventory stock if order is created in PAID status
		if order.PaymentStatus == domain.PaymentStatusPaid && !order.StockDeducted {
			if err := r.deductStockForOrderTx(txCtx, order.TenantID, order); err != nil {
				return fmt.Errorf("auto-deduct inventory stock on order creation: %w", err)
			}
		}

		return nil
	})

	if err != nil {
		return nil, err
	}
	return createdOrder, nil
}

// AddOrderItems adds new items to an existing open dine-in order and updates totals.
func (r *PostgresPOSRepository) AddOrderItems(ctx context.Context, tenantID, orderID uuid.UUID, items []domain.OrderItem) (*domain.Order, error) {
	err := r.txMgr.WithTx(ctx, func(txCtx context.Context) error {
		insertItemQuery := `
			INSERT INTO order_items (order_id, menu_item_id, item_name, unit_price, quantity, subtotal, notes, status)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		`
		for _, it := range items {
			if _, err := r.txMgr.Conn(txCtx).Exec(txCtx, insertItemQuery,
				orderID, it.MenuItemID, it.ItemName, it.UnitPrice, it.Quantity, it.Subtotal, it.Notes, it.Status,
			); err != nil {
				return fmt.Errorf("insert added item: %w", err)
			}
		}

		// Recalculate totals
		var newSubtotal float64
		calcQuery := `SELECT COALESCE(SUM(subtotal), 0) FROM order_items WHERE order_id = $1 AND status != 'CANCELLED'`
		if err := r.txMgr.Conn(txCtx).QueryRow(txCtx, calcQuery, orderID).Scan(&newSubtotal); err != nil {
			return fmt.Errorf("recalculate subtotal: %w", err)
		}

		var taxPct, discount float64
		if err := r.txMgr.Conn(txCtx).QueryRow(txCtx, `SELECT tax_pb1_percent, discount_amount FROM orders WHERE id = $1`, orderID).Scan(&taxPct, &discount); err != nil {
			return fmt.Errorf("get order tax pct: %w", err)
		}

		subAfterDisc := math.Max(0, newSubtotal-discount)
		taxAmount := currency.CalculateTaxPB1(subAfterDisc, taxPct)
		finalTotal := subAfterDisc + taxAmount

		updateOrderQuery := `
			UPDATE orders
			SET subtotal = $1, tax_pb1_amount = $2, final_total = $3, updated_at = now()
			WHERE id = $4
		`
		if _, err := r.txMgr.Conn(txCtx).Exec(txCtx, updateOrderQuery, newSubtotal, taxAmount, finalTotal, orderID); err != nil {
			return fmt.Errorf("update order totals: %w", err)
		}
		return nil
	})

	if err != nil {
		return nil, err
	}
	return r.GetOrderByID(ctx, tenantID, orderID)
}

// ApplyPayment registers a tender payment and settles the order.
func (r *PostgresPOSRepository) ApplyPayment(ctx context.Context, tenantID, orderID uuid.UUID, payment domain.OrderPayment) (*domain.Order, error) {
	err := r.txMgr.WithTx(ctx, func(txCtx context.Context) error {
		// 1. Lock the order row to prevent concurrent duplicate payments
		var curPaymentStatus, curStatus string
		var curFinalTotal, curPaidAmount float64
		var curStockDeducted bool
		var curPaymentFlow string
		var curTableID *uuid.UUID

		lockQuery := `
			SELECT payment_status, status, final_total, paid_amount, stock_deducted, payment_flow, table_id
			FROM orders
			WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL
			FOR UPDATE
		`
		if err := r.txMgr.Conn(txCtx).QueryRow(txCtx, lockQuery, tenantID, orderID).Scan(
			&curPaymentStatus, &curStatus, &curFinalTotal, &curPaidAmount,
			&curStockDeducted, &curPaymentFlow, &curTableID,
		); err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return domain.NotFound("order tidak ditemukan")
			}
			return fmt.Errorf("lock order for payment: %w", err)
		}

		if curPaymentStatus == domain.PaymentStatusPaid || curStatus == domain.OrderStatusCompleted {
			return domain.Conflict("order_already_paid", "order sudah lunas dan tidak dapat dibayar lagi")
		}
		if curStatus == domain.OrderStatusCancelled || curStatus == domain.OrderStatusVoid {
			return domain.Conflict("order_closed", "order dalam status dibatalkan atau void")
		}

		remaining := curFinalTotal - curPaidAmount
		if remaining <= 0 {
			return domain.Conflict("order_already_paid", "order sudah tidak memiliki sisa tagihan")
		}

		if payment.PaymentMethod != "CASH" && payment.Amount > remaining {
			return domain.Invalid("nominal pembayaran non-tunai tidak boleh melebihi sisa tagihan (Rp %.0f)", remaining)
		}

		newPaid := curPaidAmount + payment.Amount
		change := 0.0
		if newPaid > curFinalTotal {
			change = newPaid - curFinalTotal
		}
		payment.ChangeGiven = change

		// Insert Payment Record
		insertPaymentQuery := `
			INSERT INTO order_payments (order_id, payment_method, amount, change_given, reference_number, paid_by, paid_at)
			VALUES ($1, $2, $3, $4, $5, $6, now())
		`
		if _, err := r.txMgr.Conn(txCtx).Exec(txCtx, insertPaymentQuery,
			orderID, payment.PaymentMethod, payment.Amount, payment.ChangeGiven, payment.ReferenceNumber, payment.PaidBy,
		); err != nil {
			return fmt.Errorf("insert payment: %w", err)
		}

		// Check if fully paid
		paymentStatus := domain.PaymentStatusPartiallyPaid
		orderStatus := curStatus
		var closedAt *time.Time

		if newPaid >= curFinalTotal {
			paymentStatus = domain.PaymentStatusPaid
			now := time.Now()
			closedAt = &now

			if curPaymentFlow == domain.PaymentFlowPayFirst {
				// Pay first: move to in kitchen for immediate cooking
				orderStatus = domain.OrderStatusInKitchen
			} else {
				// Pay after: dining finished, mark completed
				orderStatus = domain.OrderStatusCompleted
				// Free up table and mark DIRTY
				if curTableID != nil {
					if _, err := r.txMgr.Conn(txCtx).Exec(txCtx, `UPDATE dining_tables SET status = 'DIRTY', active_order_id = NULL WHERE id = $1`, *curTableID); err != nil {
						return fmt.Errorf("update table status to dirty: %w", err)
					}
				}
			}
		}

		updateOrderQuery := `
			UPDATE orders
			SET paid_amount = $1, change_amount = $2, payment_status = $3, status = $4, closed_at = $5, updated_at = now()
			WHERE id = $6
		`
		if _, err := r.txMgr.Conn(txCtx).Exec(txCtx, updateOrderQuery, newPaid, change, paymentStatus, orderStatus, closedAt, orderID); err != nil {
			return fmt.Errorf("update order payment status: %w", err)
		}

		// Trigger realtime inventory deduction when order is paid in full
		if paymentStatus == domain.PaymentStatusPaid && !curStockDeducted {
			ord, err := r.GetOrderByID(txCtx, tenantID, orderID)
			if err != nil {
				return fmt.Errorf("load order for deduction: %w", err)
			}
			if err := r.deductStockForOrderTx(txCtx, tenantID, ord); err != nil {
				return fmt.Errorf("auto-deduct inventory stock: %w", err)
			}
		}

		return nil
	})

	if err != nil {
		return nil, err
	}
	return r.GetOrderByID(ctx, tenantID, orderID)
}

// SaveSplitBills creates or replaces split bill partitions for an order.
func (r *PostgresPOSRepository) SaveSplitBills(ctx context.Context, tenantID, orderID uuid.UUID, splits []domain.SplitBill) ([]domain.SplitBill, error) {
	err := r.txMgr.WithTx(ctx, func(txCtx context.Context) error {
		// Delete existing unpaid split bills
		if _, err := r.txMgr.Conn(txCtx).Exec(txCtx, `DELETE FROM split_bills WHERE order_id = $1 AND is_paid = false`, orderID); err != nil {
			return fmt.Errorf("clean unpaid split bills: %w", err)
		}

		insertSplitQuery := `
			INSERT INTO split_bills (order_id, split_number, payer_name, subtotal, tax_pb1_amount, final_amount, paid_amount, is_paid)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
			RETURNING id, created_at
		`
		insertItemQuery := `
			INSERT INTO split_bill_items (split_bill_id, order_item_id, quantity, amount)
			VALUES ($1, $2, $3, $4)
		`

		for i := range splits {
			splits[i].OrderID = orderID
			err := r.txMgr.Conn(txCtx).QueryRow(txCtx, insertSplitQuery,
				orderID, splits[i].SplitNumber, splits[i].PayerName, splits[i].Subtotal,
				splits[i].TaxPB1Amount, splits[i].FinalAmount, splits[i].PaidAmount, splits[i].IsPaid,
			).Scan(&splits[i].ID, &splits[i].CreatedAt)
			if err != nil {
				return fmt.Errorf("insert split bill %d: %w", splits[i].SplitNumber, err)
			}

			for _, it := range splits[i].Items {
				if _, err := r.txMgr.Conn(txCtx).Exec(txCtx, insertItemQuery,
					splits[i].ID, it.OrderItemID, it.Quantity, it.Amount,
				); err != nil {
					return fmt.Errorf("insert split item: %w", err)
				}
			}
		}
		return nil
	})

	if err != nil {
		return nil, err
	}
	return splits, nil
}

// PaySplitBill marks one split bill as paid, records an order payment, and closes the order if all splits are settled.
func (r *PostgresPOSRepository) PaySplitBill(ctx context.Context, tenantID, orderID, splitBillID uuid.UUID, paymentMethod string, amount float64) (*domain.SplitBill, *domain.Order, error) {
	var updatedSplit domain.SplitBill

	err := r.txMgr.WithTx(ctx, func(txCtx context.Context) error {
		// 1. Lock the order row
		var curStatus, curPaymentStatus string
		if err := r.txMgr.Conn(txCtx).QueryRow(txCtx, `
			SELECT status, payment_status
			FROM orders
			WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL
			FOR UPDATE
		`, tenantID, orderID).Scan(&curStatus, &curPaymentStatus); err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return domain.NotFound("order tidak ditemukan")
			}
			return fmt.Errorf("lock order for split pay: %w", err)
		}
		if curStatus == domain.OrderStatusCancelled || curStatus == domain.OrderStatusVoid {
			return domain.Conflict("order_closed", "order dalam status dibatalkan atau void")
		}

		now := time.Now()
		updateSplitQuery := `
			UPDATE split_bills
			SET is_paid = true, paid_at = $1, payment_method = $2, paid_amount = $3
			WHERE id = $4 AND order_id = $5 AND is_paid = false
			RETURNING id, order_id, split_number, payer_name, subtotal, tax_pb1_amount, final_amount, paid_amount, payment_method, is_paid, paid_at, created_at
		`
		err := r.txMgr.Conn(txCtx).QueryRow(txCtx, updateSplitQuery, now, paymentMethod, amount, splitBillID, orderID).Scan(
			&updatedSplit.ID, &updatedSplit.OrderID, &updatedSplit.SplitNumber, &updatedSplit.PayerName,
			&updatedSplit.Subtotal, &updatedSplit.TaxPB1Amount, &updatedSplit.FinalAmount,
			&updatedSplit.PaidAmount, &updatedSplit.PaymentMethod, &updatedSplit.IsPaid,
			&updatedSplit.PaidAt, &updatedSplit.CreatedAt,
		)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return domain.Conflict("split_already_paid", "bagian tagihan split ini sudah lunas atau tidak ditemukan")
			}
			return fmt.Errorf("update split bill: %w", err)
		}

		// Record in order payments
		ref := fmt.Sprintf("SPLIT-%s-#%d", updatedSplit.PayerName, updatedSplit.SplitNumber)
		insertPaymentQuery := `
			INSERT INTO order_payments (order_id, payment_method, amount, change_given, reference_number, paid_by, paid_at)
			VALUES ($1, $2, $3, 0, $4, $5, now())
		`
		if _, err := r.txMgr.Conn(txCtx).Exec(txCtx, insertPaymentQuery, orderID, paymentMethod, amount, ref, updatedSplit.PayerName); err != nil {
			return fmt.Errorf("insert split payment: %w", err)
		}

		// Update order's paid_amount
		if _, err := r.txMgr.Conn(txCtx).Exec(txCtx, `UPDATE orders SET paid_amount = paid_amount + $1 WHERE id = $2`, amount, orderID); err != nil {
			return fmt.Errorf("increment order paid amount: %w", err)
		}

		// Check if all splits are settled
		var unpaidCount int
		if err := r.txMgr.Conn(txCtx).QueryRow(txCtx, `SELECT COUNT(*) FROM split_bills WHERE order_id = $1 AND is_paid = false`, orderID).Scan(&unpaidCount); err != nil {
			return fmt.Errorf("check unpaid splits: %w", err)
		}

		if unpaidCount == 0 {
			// All splits settled! Complete the order
			updateOrderQuery := `
				UPDATE orders
				SET payment_status = 'PAID', status = 'COMPLETED', closed_at = now(), updated_at = now()
				WHERE id = $1
				RETURNING table_id
			`
			var tableID *uuid.UUID
			if err := r.txMgr.Conn(txCtx).QueryRow(txCtx, updateOrderQuery, orderID).Scan(&tableID); err != nil {
				return fmt.Errorf("close order on split completion: %w", err)
			}

			if tableID != nil {
				if _, err := r.txMgr.Conn(txCtx).Exec(txCtx, `UPDATE dining_tables SET status = 'DIRTY', active_order_id = NULL WHERE id = $1`, *tableID); err != nil {
					return fmt.Errorf("mark table dirty on split completion: %w", err)
				}
			}

			// Deduct stock for fully settled split order
			ord, err := r.GetOrderByID(txCtx, tenantID, orderID)
			if err == nil && ord != nil && !ord.StockDeducted {
				if err := r.deductStockForOrderTx(txCtx, tenantID, ord); err != nil {
					return fmt.Errorf("auto-deduct inventory stock on split completion: %w", err)
				}
			}
		}

		return nil
	})

	if err != nil {
		return nil, nil, err
	}

	ord, err := r.GetOrderByID(ctx, tenantID, orderID)
	if err != nil {
		return nil, nil, err
	}
	return &updatedSplit, ord, nil
}

// ListReservations returns reservations filtered by outlet and date.
func (r *PostgresPOSRepository) ListReservations(ctx context.Context, tenantID uuid.UUID, outletID *uuid.UUID, date *string) ([]domain.Reservation, error) {
	query := `
		SELECT 
			res.id, res.tenant_id, res.outlet_id, ot.code AS outlet_code,
			res.reservation_number, res.customer_id, res.customer_name, res.customer_phone,
			res.event_type, res.pax_count, TO_CHAR(res.reservation_date, 'YYYY-MM-DD'),
			res.start_time, res.end_time,
			res.assigned_table_id, dt.table_number AS assigned_table_number,
			res.min_spend, res.deposit_amount, res.deposit_paid, res.deposit_payment_method,
			res.dp_receipt_ref, res.dp_claim_order_id,
			res.status, res.special_requests,
			res.banquet_package_id, COALESCE(bp.name, ''),
			res.kitchen_prep_status, res.layout_setup_notes, res.whatsapp_reminder_sent_at,
			res.created_at, res.updated_at
		FROM reservations res
		JOIN outlets ot ON ot.id = res.outlet_id
		LEFT JOIN dining_tables dt ON dt.id = res.assigned_table_id
		LEFT JOIN banquet_packages bp ON bp.id = res.banquet_package_id
		WHERE res.tenant_id = $1
		  AND ($2::UUID IS NULL OR res.outlet_id = $2)
		  AND ($3::TEXT IS NULL OR TO_CHAR(res.reservation_date, 'YYYY-MM-DD') = $3)
		ORDER BY res.reservation_date ASC, res.start_time ASC
	`

	rows, err := r.txMgr.Conn(ctx).Query(ctx, query, tenantID, outletID, date)
	if err != nil {
		return nil, fmt.Errorf("list reservations: %w", err)
	}
	defer rows.Close()

	reservations := make([]domain.Reservation, 0)
	for rows.Next() {
		var res domain.Reservation
		if err := rows.Scan(
			&res.ID,
			&res.TenantID,
			&res.OutletID,
			&res.OutletCode,
			&res.ReservationNumber,
			&res.CustomerID,
			&res.CustomerName,
			&res.CustomerPhone,
			&res.EventType,
			&res.PaxCount,
			&res.ReservationDate,
			&res.StartTime,
			&res.EndTime,
			&res.AssignedTableID,
			&res.AssignedTableNumber,
			&res.MinSpend,
			&res.DepositAmount,
			&res.DepositPaid,
			&res.DepositPaymentMethod,
			&res.DPReceiptRef,
			&res.DPClaimOrderID,
			&res.Status,
			&res.SpecialRequests,
			&res.BanquetPackageID,
			&res.BanquetPackageName,
			&res.KitchenPrepStatus,
			&res.LayoutSetupNotes,
			&res.WhatsAppReminderSentAt,
			&res.CreatedAt,
			&res.UpdatedAt,
		); err != nil {
			return nil, fmt.Errorf("scan reservation: %w", err)
		}
		reservations = append(reservations, res)
	}

	// Fetch pre-orders for all fetched reservations
	for i := range reservations {
		poQuery := `
			SELECT 
				id, reservation_id, menu_item_id, banquet_package_id,
				item_name, quantity, unit_price, total_price,
				serving_stage, kitchen_prep_station, prep_status, COALESCE(special_notes, ''), created_at
			FROM reservation_preorders
			WHERE reservation_id = $1
			ORDER BY created_at ASC
		`
		poRows, err := r.txMgr.Conn(ctx).Query(ctx, poQuery, reservations[i].ID)
		if err == nil {
			for poRows.Next() {
				var po domain.ReservationPreorder
				if err := poRows.Scan(
					&po.ID, &po.ReservationID, &po.MenuItemID, &po.BanquetPackageID,
					&po.ItemName, &po.Quantity, &po.UnitPrice, &po.TotalPrice,
					&po.ServingStage, &po.KitchenPrepStation, &po.PrepStatus, &po.SpecialNotes, &po.CreatedAt,
				); err == nil {
					reservations[i].Preorders = append(reservations[i].Preorders, po)
				}
			}
			poRows.Close()
		}
	}

	return reservations, nil
}

// CreateReservation saves a new event reservation and marks the assigned table as RESERVED.
func (r *PostgresPOSRepository) CreateReservation(ctx context.Context, res *domain.Reservation) (*domain.Reservation, error) {
	err := r.txMgr.WithTx(ctx, func(txCtx context.Context) error {
		var count int
		dateCompact := time.Now().Format("20060102")
		if err := r.txMgr.Conn(txCtx).QueryRow(txCtx, `SELECT COUNT(*) FROM reservations WHERE tenant_id = $1`, res.TenantID).Scan(&count); err != nil {
			return fmt.Errorf("count reservations: %w", err)
		}
		res.ReservationNumber = fmt.Sprintf("RSV-%s-%03d", dateCompact, count+1)
		if res.KitchenPrepStatus == "" {
			res.KitchenPrepStatus = "QUEUED"
		}

		insertQuery := `
			INSERT INTO reservations (
				tenant_id, outlet_id, reservation_number, customer_id, customer_name, customer_phone,
				event_type, pax_count, reservation_date, start_time, end_time,
				assigned_table_id, min_spend, deposit_amount, deposit_paid, deposit_payment_method,
				dp_receipt_ref, status, special_requests,
				banquet_package_id, kitchen_prep_status, layout_setup_notes
			) VALUES (
				$1, $2, $3, $4, $5, $6,
				$7, $8, $9::DATE, $10, $11,
				$12, $13, $14, $15, $16,
				$17, $18, $19,
				$20, $21, $22
			) RETURNING id, created_at, updated_at
		`
		err := r.txMgr.Conn(txCtx).QueryRow(txCtx, insertQuery,
			res.TenantID, res.OutletID, res.ReservationNumber, res.CustomerID, res.CustomerName, res.CustomerPhone,
			res.EventType, res.PaxCount, res.ReservationDate, res.StartTime, res.EndTime,
			res.AssignedTableID, res.MinSpend, res.DepositAmount, res.DepositPaid, res.DepositPaymentMethod,
			res.DPReceiptRef, res.Status, res.SpecialRequests,
			res.BanquetPackageID, res.KitchenPrepStatus, res.LayoutSetupNotes,
		).Scan(&res.ID, &res.CreatedAt, &res.UpdatedAt)
		if err != nil {
			return fmt.Errorf("insert reservation: %w", err)
		}

		// Insert preorders if provided
		for i := range res.Preorders {
			po := &res.Preorders[i]
			po.ReservationID = res.ID
			if po.PrepStatus == "" {
				po.PrepStatus = "QUEUED"
			}
			po.TotalPrice = float64(po.Quantity) * po.UnitPrice

			poInsert := `
				INSERT INTO reservation_preorders (
					reservation_id, menu_item_id, banquet_package_id,
					item_name, quantity, unit_price, total_price,
					serving_stage, kitchen_prep_station, prep_status, special_notes
				) VALUES (
					$1, $2, $3,
					$4, $5, $6, $7,
					$8, $9, $10, $11
				) RETURNING id, created_at
			`
			err = r.txMgr.Conn(txCtx).QueryRow(
				txCtx, poInsert,
				po.ReservationID, po.MenuItemID, po.BanquetPackageID,
				po.ItemName, po.Quantity, po.UnitPrice, po.TotalPrice,
				po.ServingStage, po.KitchenPrepStation, po.PrepStatus, po.SpecialNotes,
			).Scan(&po.ID, &po.CreatedAt)
			if err != nil {
				return fmt.Errorf("insert preorder: %w", err)
			}
		}

		if res.AssignedTableID != nil {
			if _, err := r.txMgr.Conn(txCtx).Exec(txCtx, `UPDATE dining_tables SET status = 'RESERVED' WHERE id = $1`, *res.AssignedTableID); err != nil {
				return fmt.Errorf("update table status to reserved: %w", err)
			}
		}
		return nil
	})

	if err != nil {
		return nil, err
	}
	return res, nil
}

// CheckInReservation transitions reservation to SEATED and creates an active table order with DP credited.
func (r *PostgresPOSRepository) CheckInReservation(ctx context.Context, tenantID, reservationID, tableID uuid.UUID, createdBy uuid.UUID) (*domain.Order, error) {
	var createdOrder *domain.Order

	err := r.txMgr.WithTx(ctx, func(txCtx context.Context) error {
		var res domain.Reservation
		resQuery := `
			SELECT outlet_id, customer_id, customer_name, customer_phone, pax_count, deposit_amount, deposit_paid
			FROM reservations
			WHERE tenant_id = $1 AND id = $2
		`
		err := r.txMgr.Conn(txCtx).QueryRow(txCtx, resQuery, tenantID, reservationID).Scan(
			&res.OutletID, &res.CustomerID, &res.CustomerName, &res.CustomerPhone, &res.PaxCount, &res.DepositAmount, &res.DepositPaid,
		)
		if err != nil {
			return fmt.Errorf("find reservation: %w", err)
		}

		// Open table order
		ord := &domain.Order{
			TenantID:        tenantID,
			OutletID:        res.OutletID,
			OrderType:       domain.OrderTypeEventReservation,
			PaymentFlow:     domain.PaymentFlowPayAfter,
			TableID:         &tableID,
			CustomerID:      res.CustomerID,
			CustomerName:    res.CustomerName,
			CustomerPhone:   &res.CustomerPhone,
			PaxCount:        res.PaxCount,
			Status:          domain.OrderStatusOpen,
			PaymentStatus:   domain.PaymentStatusUnpaid,
			TaxPB1Percent:   10.0,
			CreatedBy:       &createdBy,
			ReservationID:   &reservationID,
			DPClaimedAmount: 0,
		}

		if res.DepositPaid && res.DepositAmount > 0 {
			ord.DiscountAmount = res.DepositAmount
			ord.DPClaimedAmount = res.DepositAmount
			note := fmt.Sprintf("Kredit Uang Muka (DP) Event: Rp %s", fmt.Sprintf("%.0f", res.DepositAmount))
			ord.DiscountNote = &note
		}

		created, err := r.CreateOrder(txCtx, ord, nil)
		if err != nil {
			return fmt.Errorf("open table order for reservation: %w", err)
		}
		createdOrder = created

		// Update reservation status to SEATED and link claim order ID
		if _, err := r.txMgr.Conn(txCtx).Exec(txCtx, `UPDATE reservations SET status = 'SEATED', assigned_table_id = $1, dp_claim_order_id = $2 WHERE id = $3`, tableID, created.ID, reservationID); err != nil {
			return fmt.Errorf("update reservation to seated: %w", err)
		}

		return nil
	})

	if err != nil {
		return nil, err
	}
	return createdOrder, nil
}

// GetMenuItemMap returns map of PUBLISHED & available item names and prices for POS order validation.
func (r *PostgresPOSRepository) GetMenuItemMap(ctx context.Context, tenantID uuid.UUID) (map[uuid.UUID]string, map[uuid.UUID]float64, error) {
	query := `
		SELECT id, name, selling_price
		FROM menu_items
		WHERE tenant_id = $1 AND deleted_at IS NULL
		  AND COALESCE(status, 'PUBLISHED') = 'PUBLISHED'
		  AND is_available = true
	`
	rows, err := r.txMgr.Conn(ctx).Query(ctx, query, tenantID)
	if err != nil {
		return nil, nil, fmt.Errorf("get menu item map: %w", err)
	}
	defer rows.Close()

	names := make(map[uuid.UUID]string)
	prices := make(map[uuid.UUID]float64)

	for rows.Next() {
		var id uuid.UUID
		var name string
		var price float64
		if err := rows.Scan(&id, &name, &price); err != nil {
			return nil, nil, fmt.Errorf("scan menu item map: %w", err)
		}
		names[id] = name
		prices[id] = price
	}
	return names, prices, nil
}

// GetUserIDByUsername finds user ID by username.
func (r *PostgresPOSRepository) GetUserIDByUsername(ctx context.Context, tenantID uuid.UUID, username string) (uuid.UUID, error) {
	var id uuid.UUID
	query := `SELECT id FROM users WHERE tenant_id = $1 AND username = $2 AND deleted_at IS NULL`
	err := r.txMgr.Conn(ctx).QueryRow(ctx, query, tenantID, username).Scan(&id)
	if err != nil {
		return uuid.Nil, fmt.Errorf("get user id by username %s: %w", username, err)
	}
	return id, nil
}

func deriveStation(outletCode, categoryCode string) string {
	if outletCode == "TSH-01" {
		switch categoryCode {
		case "CAT-STEAK":
			return "GRILL_STEAK"
		case "CAT-SAUCE":
			return "SIDES_PANTRY"
		default:
			return "BEVERAGE_BAR"
		}
	}
	switch categoryCode {
	case "CAT-GARDEN":
		return "BAKARAN_GORENG"
	default:
		return "BAR_TRADISIONAL"
	}
}

// ListKitchenTickets retrieves active orders formatted as kitchen tickets with station routing.
func (r *PostgresPOSRepository) ListKitchenTickets(ctx context.Context, tenantID uuid.UUID, outletID *uuid.UUID, station *string, includeServed bool) ([]domain.KitchenTicket, error) {
	statusFilter := "AND o.status IN ('OPEN', 'IN_KITCHEN') AND (o.payment_flow <> 'PAY_FIRST' OR o.payment_status = 'PAID')"
	if includeServed {
		statusFilter = "AND o.status IN ('OPEN', 'IN_KITCHEN', 'SERVED') AND (o.payment_flow <> 'PAY_FIRST' OR o.payment_status = 'PAID')"
	}

	query := fmt.Sprintf(`
		SELECT 
			o.id, o.tenant_id, o.outlet_id, ot.code AS outlet_code, ot.name AS outlet_name,
			o.order_number, o.order_type, o.table_id, dt.table_number, dt.section,
			o.customer_name, o.pax_count, o.status,
			o.created_at, o.updated_at
		FROM orders o
		JOIN outlets ot ON ot.id = o.outlet_id
		LEFT JOIN dining_tables dt ON dt.id = o.table_id
		WHERE o.tenant_id = $1 AND o.deleted_at IS NULL
		  AND ($2::UUID IS NULL OR o.outlet_id = $2)
		  %s
		ORDER BY o.created_at ASC
	`, statusFilter)

	rows, err := r.txMgr.Conn(ctx).Query(ctx, query, tenantID, outletID)
	if err != nil {
		return nil, fmt.Errorf("list kitchen orders: %w", err)
	}
	defer rows.Close()

	tickets := make([]domain.KitchenTicket, 0)
	for rows.Next() {
		var t domain.KitchenTicket
		if err := rows.Scan(
			&t.ID,
			&t.TenantID,
			&t.OutletID,
			&t.OutletCode,
			&t.OutletName,
			&t.OrderNumber,
			&t.OrderType,
			&t.TableID,
			&t.TableNumber,
			&t.Section,
			&t.CustomerName,
			&t.PaxCount,
			&t.Status,
			&t.CreatedAt,
			&t.UpdatedAt,
		); err != nil {
			return nil, fmt.Errorf("scan kitchen ticket: %w", err)
		}
		t.Items = make([]domain.KitchenTicketItem, 0)
		tickets = append(tickets, t)
	}

	// For each ticket, load items with category and explicit kitchen_station
	nonEmptyTickets := make([]domain.KitchenTicket, 0, len(tickets))
	for i := range tickets {
		itemsQuery := `
			SELECT 
				oi.id, oi.menu_item_id, oi.item_name,
				COALESCE(mc.code, '') AS category_code,
				COALESCE(mc.name, '') AS category_name,
				COALESCE(m.kitchen_station, '') AS kitchen_station,
				oi.quantity, oi.notes, oi.status,
				oi.created_at, oi.updated_at
			FROM order_items oi
			JOIN menu_items m ON m.id = oi.menu_item_id
			LEFT JOIN menu_categories mc ON mc.id = m.category_id
			WHERE oi.order_id = $1
			ORDER BY oi.created_at ASC
		`
		iRows, err := r.txMgr.Conn(ctx).Query(ctx, itemsQuery, tickets[i].ID)
		if err != nil {
			return nil, fmt.Errorf("load ticket items: %w", err)
		}

		for iRows.Next() {
			var it domain.KitchenTicketItem
			var explicitStation string
			if err := iRows.Scan(
				&it.ID,
				&it.MenuItemID,
				&it.ItemName,
				&it.CategoryCode,
				&it.CategoryName,
				&explicitStation,
				&it.Quantity,
				&it.Notes,
				&it.Status,
				&it.CreatedAt,
				&it.UpdatedAt,
			); err != nil {
				iRows.Close()
				return nil, fmt.Errorf("scan ticket item: %w", err)
			}
			// Grab-and-go snacks explicitly configured with NONE skip KDS monitors
			if explicitStation == "NONE" {
				continue
			}
			if explicitStation != "" {
				it.Station = explicitStation
			} else {
				it.Station = deriveStation(tickets[i].OutletCode, it.CategoryCode)
			}
			tickets[i].Items = append(tickets[i].Items, it)
		}
		iRows.Close()

		if len(tickets[i].Items) > 0 {
			nonEmptyTickets = append(nonEmptyTickets, tickets[i])
		}
	}
	tickets = nonEmptyTickets

	// Filter by station if provided
	if station != nil && *station != "ALL" && *station != "" {
		targetStation := *station
		filtered := make([]domain.KitchenTicket, 0)
		for _, t := range tickets {
			var stationItems []domain.KitchenTicketItem
			for _, it := range t.Items {
				if it.Station == targetStation || targetStation == "EXPEDITER" {
					stationItems = append(stationItems, it)
				}
			}
			if len(stationItems) > 0 {
				t.Items = stationItems
				filtered = append(filtered, t)
			}
		}
		return filtered, nil
	}

	return tickets, nil
}

// UpdateOrderItemStatus updates the status of an individual item in a kitchen ticket.
func (r *PostgresPOSRepository) UpdateOrderItemStatus(ctx context.Context, tenantID, orderID, itemID uuid.UUID, status string) error {
	query := `
		UPDATE order_items
		SET status = $1, updated_at = now()
		WHERE id = $2 AND order_id = $3
	`
	tag, err := r.txMgr.Conn(ctx).Exec(ctx, query, status, itemID, orderID)
	if err != nil {
		return fmt.Errorf("update order item status: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return domain.NotFound("order item not found")
	}
	return nil
}

// UpdateOrderStatus updates the overall order status.
func (r *PostgresPOSRepository) UpdateOrderStatus(ctx context.Context, tenantID, orderID uuid.UUID, status string) error {
	query := `
		UPDATE orders
		SET status = $1, updated_at = now()
		WHERE tenant_id = $2 AND id = $3 AND deleted_at IS NULL
	`
	tag, err := r.txMgr.Conn(ctx).Exec(ctx, query, status, tenantID, orderID)
	if err != nil {
		return fmt.Errorf("update order status: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return domain.NotFound("order not found")
	}
	return nil
}

// BumpTicket marks a ticket with the target status (e.g. READY or SERVED) and updates all its items.
func (r *PostgresPOSRepository) BumpTicket(ctx context.Context, tenantID, orderID uuid.UUID, targetStatus string) (*domain.KitchenTicket, error) {
	itemStatus := targetStatus
	_, err := r.txMgr.Conn(ctx).Exec(ctx, `
		UPDATE order_items
		SET status = $1, updated_at = now()
		WHERE order_id = $2
	`, itemStatus, orderID)
	if err != nil {
		return nil, fmt.Errorf("bump ticket items: %w", err)
	}

	orderStatus := "IN_KITCHEN"
	if targetStatus == "SERVED" {
		orderStatus = "SERVED"
	}
	_, err = r.txMgr.Conn(ctx).Exec(ctx, `
		UPDATE orders
		SET status = $1, updated_at = now()
		WHERE tenant_id = $2 AND id = $3
	`, orderStatus, tenantID, orderID)
	if err != nil {
		return nil, fmt.Errorf("bump order: %w", err)
	}

	tickets, err := r.ListKitchenTickets(ctx, tenantID, nil, nil, true)
	if err != nil {
		return nil, err
	}
	for _, t := range tickets {
		if t.ID == orderID {
			return &t, nil
		}
	}
	return nil, nil
}

// ListBanquetPackages lists banquet and buffet packages with items.
func (r *PostgresPOSRepository) ListBanquetPackages(ctx context.Context, tenantID uuid.UUID, outletID *uuid.UUID) ([]domain.BanquetPackage, error) {
	query := `
		SELECT 
			id, tenant_id, outlet_id, code, name, COALESCE(description, ''),
			min_pax, price_per_pax, category, is_active, created_at, updated_at
		FROM banquet_packages
		WHERE tenant_id = $1 AND is_active = true
	`
	args := []any{tenantID}
	if outletID != nil {
		query += " AND (outlet_id IS NULL OR outlet_id = $2)"
		args = append(args, *outletID)
	}
	query += " ORDER BY category, code"

	rows, err := r.txMgr.Conn(ctx).Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("list banquet packages: %w", err)
	}
	defer rows.Close()

	packages := make([]domain.BanquetPackage, 0)
	for rows.Next() {
		var pkg domain.BanquetPackage
		pkg.Items = make([]domain.BanquetPackageItem, 0)
		if err := rows.Scan(
			&pkg.ID, &pkg.TenantID, &pkg.OutletID, &pkg.Code, &pkg.Name, &pkg.Description,
			&pkg.MinPax, &pkg.PricePerPax, &pkg.Category, &pkg.IsActive, &pkg.CreatedAt, &pkg.UpdatedAt,
		); err != nil {
			return nil, fmt.Errorf("scan banquet package: %w", err)
		}
		packages = append(packages, pkg)
	}

	for i := range packages {
		iQuery := `
			SELECT 
				bpi.id, bpi.package_id, bpi.menu_item_id, mi.name,
				bpi.dish_course, bpi.portion_multiplier, COALESCE(bpi.notes, ''), bpi.created_at
			FROM banquet_package_items bpi
			JOIN menu_items mi ON bpi.menu_item_id = mi.id
			WHERE bpi.package_id = $1
			ORDER BY bpi.dish_course, mi.name
		`
		iRows, err := r.txMgr.Conn(ctx).Query(ctx, iQuery, packages[i].ID)
		if err == nil {
			for iRows.Next() {
				var it domain.BanquetPackageItem
				if err := iRows.Scan(
					&it.ID, &it.PackageID, &it.MenuItemID, &it.MenuItemName,
					&it.DishCourse, &it.PortionMultiplier, &it.Notes, &it.CreatedAt,
				); err == nil {
					packages[i].Items = append(packages[i].Items, it)
				}
			}
			iRows.Close()
		}
	}

	return packages, nil
}

// CreateBanquetPackage creates a new package.
func (r *PostgresPOSRepository) CreateBanquetPackage(ctx context.Context, pkg *domain.BanquetPackage) (*domain.BanquetPackage, error) {
	err := r.txMgr.WithTx(ctx, func(txCtx context.Context) error {
		insertQuery := `
			INSERT INTO banquet_packages (
				tenant_id, outlet_id, code, name, description, min_pax, price_per_pax, category, is_active
			) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true)
			RETURNING id, created_at, updated_at
		`
		err := r.txMgr.Conn(txCtx).QueryRow(
			txCtx, insertQuery,
			pkg.TenantID, pkg.OutletID, pkg.Code, pkg.Name, pkg.Description, pkg.MinPax, pkg.PricePerPax, pkg.Category,
		).Scan(&pkg.ID, &pkg.CreatedAt, &pkg.UpdatedAt)
		if err != nil {
			return fmt.Errorf("insert banquet package: %w", err)
		}

		for i := range pkg.Items {
			it := &pkg.Items[i]
			it.PackageID = pkg.ID
			if it.PortionMultiplier <= 0 {
				it.PortionMultiplier = 1.0
			}
			if it.DishCourse == "" {
				it.DishCourse = "MAIN_COURSE"
			}
			itQuery := `
				INSERT INTO banquet_package_items (
					package_id, menu_item_id, dish_course, portion_multiplier, notes
				) VALUES ($1, $2, $3, $4, $5)
				RETURNING id, created_at
			`
			err = r.txMgr.Conn(txCtx).QueryRow(
				txCtx, itQuery,
				it.PackageID, it.MenuItemID, it.DishCourse, it.PortionMultiplier, it.Notes,
			).Scan(&it.ID, &it.CreatedAt)
			if err != nil {
				return fmt.Errorf("insert banquet package item: %w", err)
			}
		}
		return nil
	})

	if err != nil {
		return nil, err
	}
	return pkg, nil
}

// ListReservationPreorders fetches dishes preordered for a reservation.
func (r *PostgresPOSRepository) ListReservationPreorders(ctx context.Context, tenantID, reservationID uuid.UUID) ([]domain.ReservationPreorder, error) {
	query := `
		SELECT 
			po.id, po.reservation_id, po.menu_item_id, po.banquet_package_id,
			po.item_name, po.quantity, po.unit_price, po.total_price,
			po.serving_stage, po.kitchen_prep_station, po.prep_status, COALESCE(po.special_notes, ''), po.created_at
		FROM reservation_preorders po
		JOIN reservations res ON po.reservation_id = res.id
		WHERE res.tenant_id = $1 AND po.reservation_id = $2
		ORDER BY po.created_at ASC
	`
	rows, err := r.txMgr.Conn(ctx).Query(ctx, query, tenantID, reservationID)
	if err != nil {
		return nil, fmt.Errorf("list preorders: %w", err)
	}
	defer rows.Close()

	preorders := make([]domain.ReservationPreorder, 0)
	for rows.Next() {
		var po domain.ReservationPreorder
		if err := rows.Scan(
			&po.ID, &po.ReservationID, &po.MenuItemID, &po.BanquetPackageID,
			&po.ItemName, &po.Quantity, &po.UnitPrice, &po.TotalPrice,
			&po.ServingStage, &po.KitchenPrepStation, &po.PrepStatus, &po.SpecialNotes, &po.CreatedAt,
		); err != nil {
			return nil, fmt.Errorf("scan preorder: %w", err)
		}
		preorders = append(preorders, po)
	}
	return preorders, nil
}

// AddReservationPreorder adds a dish to a reservation preorder list.
func (r *PostgresPOSRepository) AddReservationPreorder(ctx context.Context, po *domain.ReservationPreorder) (*domain.ReservationPreorder, error) {
	if po.PrepStatus == "" {
		po.PrepStatus = "QUEUED"
	}
	po.TotalPrice = float64(po.Quantity) * po.UnitPrice

	query := `
		INSERT INTO reservation_preorders (
			reservation_id, menu_item_id, banquet_package_id,
			item_name, quantity, unit_price, total_price,
			serving_stage, kitchen_prep_station, prep_status, special_notes
		) VALUES (
			$1, $2, $3,
			$4, $5, $6, $7,
			$8, $9, $10, $11
		) RETURNING id, created_at
	`
	err := r.txMgr.Conn(ctx).QueryRow(
		ctx, query,
		po.ReservationID, po.MenuItemID, po.BanquetPackageID,
		po.ItemName, po.Quantity, po.UnitPrice, po.TotalPrice,
		po.ServingStage, po.KitchenPrepStation, po.PrepStatus, po.SpecialNotes,
	).Scan(&po.ID, &po.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("add preorder: %w", err)
	}
	return po, nil
}

// UpdateReservationPrepStatus updates the kitchen prep alert status.
func (r *PostgresPOSRepository) UpdateReservationPrepStatus(ctx context.Context, tenantID, reservationID uuid.UUID, prepStatus string) error {
	query := `
		UPDATE reservations
		SET kitchen_prep_status = $1, updated_at = now()
		WHERE tenant_id = $2 AND id = $3
	`
	tag, err := r.txMgr.Conn(ctx).Exec(ctx, query, prepStatus, tenantID, reservationID)
	if err != nil {
		return fmt.Errorf("update prep status: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return domain.NotFound("reservation not found")
	}

	// Update prep status on individual preorder items too
	_, _ = r.txMgr.Conn(ctx).Exec(ctx, `
		UPDATE reservation_preorders
		SET prep_status = $1
		WHERE reservation_id = $2
	`, prepStatus, reservationID)

	return nil
}

// SendReservationWAReminder updates the timestamp when a WhatsApp reminder was generated/sent.
func (r *PostgresPOSRepository) SendReservationWAReminder(ctx context.Context, tenantID, reservationID uuid.UUID) (*domain.Reservation, error) {
	query := `
		UPDATE reservations
		SET whatsapp_reminder_sent_at = now(), updated_at = now()
		WHERE tenant_id = $1 AND id = $2
	`
	_, err := r.txMgr.Conn(ctx).Exec(ctx, query, tenantID, reservationID)
	if err != nil {
		return nil, fmt.Errorf("update wa reminder: %w", err)
	}

	resList, err := r.ListReservations(ctx, tenantID, nil, nil)
	if err != nil {
		return nil, err
	}
	for _, res := range resList {
		if res.ID == reservationID {
			return &res, nil
		}
	}
	return nil, domain.NotFound("reservation not found")
}

// ----------------------------------------------------------------------------
// Cashier Shift & Cash Drawer Reconciliation
// ----------------------------------------------------------------------------

func (r *PostgresPOSRepository) populateLiveShiftTotals(ctx context.Context, shift *domain.CashierShift) error {
	// 1. Order aggregation for paid orders in this shift
	orderAggQuery := `
		SELECT
			COUNT(DISTINCT id),
			COALESCE(SUM(subtotal), 0),
			COALESCE(SUM(discount_amount), 0),
			COALESCE(SUM(tax_pb1_amount), 0),
			COALESCE(SUM(service_charge_amount), 0),
			COALESCE(SUM(final_total), 0)
		FROM orders
		WHERE tenant_id = $1 AND shift_id = $2 AND payment_status = 'PAID' AND deleted_at IS NULL
	`
	_ = r.txMgr.Conn(ctx).QueryRow(ctx, orderAggQuery, shift.TenantID, shift.ID).Scan(
		&shift.TotalTransactions,
		&shift.GrossSales,
		&shift.Discounts,
		&shift.TaxPB1,
		&shift.ServiceCharge,
		&shift.NetSales,
	)

	// 2. Payments breakdown aggregation
	payAggQuery := `
		SELECT
			COALESCE(SUM(CASE WHEN op.payment_method = 'CASH' THEN (op.amount - op.change_given) ELSE 0 END), 0),
			COALESCE(SUM(CASE WHEN op.payment_method = 'QRIS' THEN op.amount ELSE 0 END), 0),
			COALESCE(SUM(CASE WHEN op.payment_method IN ('CARD', 'DEBIT', 'CREDIT') THEN op.amount ELSE 0 END), 0),
			COALESCE(SUM(CASE WHEN op.payment_method = 'TRANSFER' THEN op.amount ELSE 0 END), 0)
		FROM order_payments op
		JOIN orders o ON o.id = op.order_id
		WHERE o.tenant_id = $1 AND o.shift_id = $2 AND o.deleted_at IS NULL
	`
	_ = r.txMgr.Conn(ctx).QueryRow(ctx, payAggQuery, shift.TenantID, shift.ID).Scan(
		&shift.PaymentCash,
		&shift.PaymentQRIS,
		&shift.PaymentCard,
		&shift.PaymentTransfer,
	)

	// 3. Cash movements aggregation
	moveAggQuery := `
		SELECT
			COALESCE(SUM(CASE WHEN movement_type = 'PAID_IN' THEN amount ELSE 0 END), 0),
			COALESCE(SUM(CASE WHEN movement_type = 'PAID_OUT' THEN amount ELSE 0 END), 0)
		FROM cashier_shift_cash_movements
		WHERE tenant_id = $1 AND shift_id = $2
	`
	_ = r.txMgr.Conn(ctx).QueryRow(ctx, moveAggQuery, shift.TenantID, shift.ID).Scan(
		&shift.TotalPaidIn,
		&shift.TotalPaidOut,
	)

	// Expected Cash in Drawer = Opening Cash + Cash Payments + Total Paid In - Total Paid Out
	shift.ExpectedCash = shift.OpeningCash + shift.PaymentCash + shift.TotalPaidIn - shift.TotalPaidOut

	if shift.ActualCash != nil {
		shift.CashDifference = *shift.ActualCash - shift.ExpectedCash
	}

	return nil
}

// GetCurrentOpenShift retrieves the active OPEN shift for a specific outlet.
func (r *PostgresPOSRepository) GetCurrentOpenShift(ctx context.Context, tenantID, outletID uuid.UUID) (*domain.CashierShift, error) {
	query := `
		SELECT 
			s.id, s.tenant_id, s.outlet_id, ot.code AS outlet_code, ot.name AS outlet_name,
			s.shift_number, s.cashier_user_id, u_c.full_name AS cashier_name,
			s.supervisor_user_id, u_s.full_name AS supervisor_name,
			s.shift_name, s.status, s.opened_at, s.closed_at,
			s.opening_cash, s.expected_cash, s.actual_cash, s.cash_difference,
			s.total_transactions, s.gross_sales, s.discounts, s.net_sales,
			s.tax_pb1, s.service_charge,
			s.payment_cash, s.payment_qris, s.payment_card, s.payment_transfer,
			s.total_paid_in, s.total_paid_out, s.notes, s.created_at, s.updated_at
		FROM cashier_shifts s
		JOIN outlets ot ON ot.id = s.outlet_id
		JOIN users u_c ON u_c.id = s.cashier_user_id
		LEFT JOIN users u_s ON u_s.id = s.supervisor_user_id
		WHERE s.tenant_id = $1 AND s.outlet_id = $2 AND s.status = 'OPEN' AND s.deleted_at IS NULL
		ORDER BY s.opened_at DESC
		LIMIT 1
	`

	var s domain.CashierShift
	err := r.txMgr.Conn(ctx).QueryRow(ctx, query, tenantID, outletID).Scan(
		&s.ID, &s.TenantID, &s.OutletID, &s.OutletCode, &s.OutletName,
		&s.ShiftNumber, &s.CashierUserID, &s.CashierName,
		&s.SupervisorUserID, &s.SupervisorName,
		&s.ShiftName, &s.Status, &s.OpenedAt, &s.ClosedAt,
		&s.OpeningCash, &s.ExpectedCash, &s.ActualCash, &s.CashDifference,
		&s.TotalTransactions, &s.GrossSales, &s.Discounts, &s.NetSales,
		&s.TaxPB1, &s.ServiceCharge,
		&s.PaymentCash, &s.PaymentQRIS, &s.PaymentCard, &s.PaymentTransfer,
		&s.TotalPaidIn, &s.TotalPaidOut, &s.Notes, &s.CreatedAt, &s.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil // No active open shift
		}
		return nil, fmt.Errorf("get current open shift: %w", err)
	}

	// Calculate real-time totals
	_ = r.populateLiveShiftTotals(ctx, &s)

	return &s, nil
}

// GetShiftByID loads any shift by ID and tenant ID.
func (r *PostgresPOSRepository) GetShiftByID(ctx context.Context, tenantID, shiftID uuid.UUID) (*domain.CashierShift, error) {
	query := `
		SELECT 
			s.id, s.tenant_id, s.outlet_id, ot.code AS outlet_code, ot.name AS outlet_name,
			s.shift_number, s.cashier_user_id, u_c.full_name AS cashier_name,
			s.supervisor_user_id, u_s.full_name AS supervisor_name,
			s.shift_name, s.status, s.opened_at, s.closed_at,
			s.opening_cash, s.expected_cash, s.actual_cash, s.cash_difference,
			s.total_transactions, s.gross_sales, s.discounts, s.net_sales,
			s.tax_pb1, s.service_charge,
			s.payment_cash, s.payment_qris, s.payment_card, s.payment_transfer,
			s.total_paid_in, s.total_paid_out, s.notes, s.created_at, s.updated_at
		FROM cashier_shifts s
		JOIN outlets ot ON ot.id = s.outlet_id
		JOIN users u_c ON u_c.id = s.cashier_user_id
		LEFT JOIN users u_s ON u_s.id = s.supervisor_user_id
		WHERE s.tenant_id = $1 AND s.id = $2 AND s.deleted_at IS NULL
	`

	var s domain.CashierShift
	err := r.txMgr.Conn(ctx).QueryRow(ctx, query, tenantID, shiftID).Scan(
		&s.ID, &s.TenantID, &s.OutletID, &s.OutletCode, &s.OutletName,
		&s.ShiftNumber, &s.CashierUserID, &s.CashierName,
		&s.SupervisorUserID, &s.SupervisorName,
		&s.ShiftName, &s.Status, &s.OpenedAt, &s.ClosedAt,
		&s.OpeningCash, &s.ExpectedCash, &s.ActualCash, &s.CashDifference,
		&s.TotalTransactions, &s.GrossSales, &s.Discounts, &s.NetSales,
		&s.TaxPB1, &s.ServiceCharge,
		&s.PaymentCash, &s.PaymentQRIS, &s.PaymentCard, &s.PaymentTransfer,
		&s.TotalPaidIn, &s.TotalPaidOut, &s.Notes, &s.CreatedAt, &s.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, domain.NotFound("shift not found")
		}
		return nil, fmt.Errorf("get shift by id: %w", err)
	}

	if s.Status == "OPEN" {
		_ = r.populateLiveShiftTotals(ctx, &s)
	}

	return &s, nil
}

// OpenShift creates and starts a new cashier shift session.
func (r *PostgresPOSRepository) OpenShift(ctx context.Context, shift *domain.CashierShift) (*domain.CashierShift, error) {
	var createdID uuid.UUID

	err := r.txMgr.WithTx(ctx, func(txCtx context.Context) error {
		// 1. Guard against concurrent multiple open shifts for the same outlet
		var existingID uuid.UUID
		err := r.txMgr.Conn(txCtx).QueryRow(txCtx, `
			SELECT id FROM cashier_shifts
			WHERE tenant_id = $1 AND outlet_id = $2 AND status = 'OPEN' AND deleted_at IS NULL
			LIMIT 1
		`, shift.TenantID, shift.OutletID).Scan(&existingID)
		if err == nil {
			return fmt.Errorf("shift aktif sudah terbuka di outlet ini. Harap tutup shift sebelumnya terlebih dahulu")
		} else if !errors.Is(err, pgx.ErrNoRows) {
			return fmt.Errorf("check existing open shift: %w", err)
		}

		// 2. Lock & generate shift number
		lockQuery := `SELECT pg_advisory_xact_lock(hashtext('shift_seq_' || $1::text || '_' || $2::text || '_' || CURRENT_DATE::text))`
		if _, err := r.txMgr.Conn(txCtx).Exec(txCtx, lockQuery, shift.TenantID, shift.OutletID); err != nil {
			return fmt.Errorf("acquire shift sequence lock: %w", err)
		}

		var outletCode string
		if err := r.txMgr.Conn(txCtx).QueryRow(txCtx, `SELECT code FROM outlets WHERE id = $1`, shift.OutletID).Scan(&outletCode); err != nil {
			return fmt.Errorf("get outlet code: %w", err)
		}

		var maxSeq int
		dateStr := time.Now().Format("20060102")
		seqQuery := `
			SELECT COALESCE(MAX(SUBSTRING(shift_number FROM '(\d+)$')::int), 0)
			FROM cashier_shifts
			WHERE tenant_id = $1 AND outlet_id = $2 AND DATE(opened_at) = CURRENT_DATE
		`
		if err := r.txMgr.Conn(txCtx).QueryRow(txCtx, seqQuery, shift.TenantID, shift.OutletID).Scan(&maxSeq); err != nil {
			return fmt.Errorf("find max daily shift sequence: %w", err)
		}

		shift.ShiftNumber = fmt.Sprintf("SHF-%s-%s-%03d", outletCode, dateStr, maxSeq+1)
		shift.Status = "OPEN"
		shift.ExpectedCash = shift.OpeningCash

		insertQuery := `
			INSERT INTO cashier_shifts (
				tenant_id, outlet_id, shift_number, cashier_user_id, supervisor_user_id,
				shift_name, status, opened_at, opening_cash, expected_cash, notes
			) VALUES (
				$1, $2, $3, $4, $5,
				$6, $7, now(), $8, $9, $10
			) RETURNING id
		`
		if err := r.txMgr.Conn(txCtx).QueryRow(txCtx, insertQuery,
			shift.TenantID, shift.OutletID, shift.ShiftNumber, shift.CashierUserID, shift.SupervisorUserID,
			shift.ShiftName, shift.Status, shift.OpeningCash, shift.ExpectedCash, shift.Notes,
		).Scan(&createdID); err != nil {
			return fmt.Errorf("insert cashier shift: %w", err)
		}

		return nil
	})

	if err != nil {
		return nil, err
	}
	return r.GetShiftByID(ctx, shift.TenantID, createdID)
}

// CloseShift performs final reconciliation, updates totals, sets actual physical cash, and marks CLOSED.
func (r *PostgresPOSRepository) CloseShift(ctx context.Context, tenantID, shiftID uuid.UUID, actualCash float64, supervisorID *uuid.UUID, notes *string) (*domain.CashierShift, error) {
	err := r.txMgr.WithTx(ctx, func(txCtx context.Context) error {
		shift, err := r.GetShiftByID(txCtx, tenantID, shiftID)
		if err != nil {
			return err
		}
		if shift.Status == "CLOSED" {
			return domain.Conflict("shift_already_closed", "shift kasir sudah ditutup sebelumnya")
		}

		shift.ActualCash = &actualCash
		if err := r.populateLiveShiftTotals(txCtx, shift); err != nil {
			return fmt.Errorf("calculate live totals on close: %w", err)
		}

		diff := actualCash - shift.ExpectedCash

		updateQuery := `
			UPDATE cashier_shifts
			SET status = 'CLOSED', closed_at = now(),
				expected_cash = $1, actual_cash = $2, cash_difference = $3,
				total_transactions = $4, gross_sales = $5, discounts = $6, net_sales = $7,
				tax_pb1 = $8, service_charge = $9,
				payment_cash = $10, payment_qris = $11, payment_card = $12, payment_transfer = $13,
				total_paid_in = $14, total_paid_out = $15,
				supervisor_user_id = COALESCE($16, supervisor_user_id),
				notes = COALESCE($17, notes),
				updated_at = now()
			WHERE tenant_id = $18 AND id = $19
		`
		_, err = r.txMgr.Conn(txCtx).Exec(txCtx, updateQuery,
			shift.ExpectedCash, actualCash, diff,
			shift.TotalTransactions, shift.GrossSales, shift.Discounts, shift.NetSales,
			shift.TaxPB1, shift.ServiceCharge,
			shift.PaymentCash, shift.PaymentQRIS, shift.PaymentCard, shift.PaymentTransfer,
			shift.TotalPaidIn, shift.TotalPaidOut,
			supervisorID, notes,
			tenantID, shiftID,
		)
		if err != nil {
			return fmt.Errorf("close cashier shift: %w", err)
		}

		return nil
	})

	if err != nil {
		return nil, err
	}
	return r.GetShiftByID(ctx, tenantID, shiftID)
}

// AddCashMovement inserts a Pay-In or Pay-Out record and recalculates the shift totals.
func (r *PostgresPOSRepository) AddCashMovement(ctx context.Context, movement *domain.CashierShiftCashMovement) (*domain.CashierShiftCashMovement, error) {
	err := r.txMgr.WithTx(ctx, func(txCtx context.Context) error {
		query := `
			INSERT INTO cashier_shift_cash_movements (
				tenant_id, shift_id, movement_type, amount, reason, authorized_by, created_at
			) VALUES (
				$1, $2, $3, $4, $5, $6, now()
			) RETURNING id, created_at
		`
		if err := r.txMgr.Conn(txCtx).QueryRow(txCtx, query,
			movement.TenantID, movement.ShiftID, movement.MovementType, movement.Amount, movement.Reason, movement.AuthorizedBy,
		).Scan(&movement.ID, &movement.CreatedAt); err != nil {
			return fmt.Errorf("insert cash movement: %w", err)
		}

		// Update shift totals
		if movement.MovementType == "PAID_IN" {
			_, _ = r.txMgr.Conn(txCtx).Exec(txCtx, `
				UPDATE cashier_shifts 
				SET total_paid_in = total_paid_in + $1, expected_cash = expected_cash + $1, updated_at = now() 
				WHERE tenant_id = $2 AND id = $3
			`, movement.Amount, movement.TenantID, movement.ShiftID)
		} else {
			_, _ = r.txMgr.Conn(txCtx).Exec(txCtx, `
				UPDATE cashier_shifts 
				SET total_paid_out = total_paid_out + $1, expected_cash = expected_cash - $1, updated_at = now() 
				WHERE tenant_id = $2 AND id = $3
			`, movement.Amount, movement.TenantID, movement.ShiftID)

			// Seamless Finance Integration: Auto-register PAID_OUT as Operating Expense (Petty Cash)
			var outletID uuid.UUID
			var shiftNumber string
			var cashierName string
			_ = r.txMgr.Conn(txCtx).QueryRow(txCtx, `
				SELECT s.outlet_id, s.shift_number, u.full_name
				FROM cashier_shifts s
				JOIN users u ON u.id = s.cashier_user_id
				WHERE s.id = $1
			`, movement.ShiftID).Scan(&outletID, &shiftNumber, &cashierName)

			var authorizerName string
			if movement.AuthorizedBy != nil {
				_ = r.txMgr.Conn(txCtx).QueryRow(txCtx, `SELECT full_name FROM users WHERE id = $1`, *movement.AuthorizedBy).Scan(&authorizerName)
			}

			// Find appropriate category (EXP-CONSUM or any first category)
			var catID uuid.UUID
			errCat := r.txMgr.Conn(txCtx).QueryRow(txCtx, `
				SELECT id FROM expense_categories
				WHERE tenant_id = $1 AND code = 'EXP-CONSUM' AND is_active = true
				LIMIT 1
			`, movement.TenantID).Scan(&catID)
			if errCat != nil {
				_ = r.txMgr.Conn(txCtx).QueryRow(txCtx, `
					SELECT id FROM expense_categories
					WHERE tenant_id = $1 AND is_active = true
					ORDER BY created_at ASC LIMIT 1
				`, movement.TenantID).Scan(&catID)
			}

			if catID != uuid.Nil {
				insertExpenseQuery := `
					INSERT INTO operating_expenses (
						tenant_id, outlet_id, category_id, expense_date, title,
						amount, payment_method, receipt_ref, recorded_by_name, approved_by_name,
						status, notes, created_at, updated_at
					) VALUES (
						$1, $2, $3, CURRENT_DATE, $4,
						$5, 'PETTY_CASH', $6, $7, $8,
						'CONFIRMED', $9, now(), now()
					)
				`
				title := fmt.Sprintf("Kas Keluar Kasir: %s", movement.Reason)
				notes := fmt.Sprintf("Auto-sync dari Shift %s", shiftNumber)
				_, _ = r.txMgr.Conn(txCtx).Exec(txCtx, insertExpenseQuery,
					movement.TenantID, outletID, catID, title,
					movement.Amount, shiftNumber, cashierName, authorizerName,
					notes,
				)
			}
		}

		return nil
	})

	if err != nil {
		return nil, err
	}
	return movement, nil
}

// ListCashMovements returns all petty cash movements for a specific shift.
func (r *PostgresPOSRepository) ListCashMovements(ctx context.Context, tenantID, shiftID uuid.UUID) ([]domain.CashierShiftCashMovement, error) {
	query := `
		SELECT m.id, m.tenant_id, m.shift_id, m.movement_type, m.amount, m.reason,
		       m.authorized_by, u.full_name AS authorizer_name, m.created_at
		FROM cashier_shift_cash_movements m
		LEFT JOIN users u ON u.id = m.authorized_by
		WHERE m.tenant_id = $1 AND m.shift_id = $2
		ORDER BY m.created_at ASC
	`
	rows, err := r.txMgr.Conn(ctx).Query(ctx, query, tenantID, shiftID)
	if err != nil {
		return nil, fmt.Errorf("list cash movements: %w", err)
	}
	defer rows.Close()

	movements := make([]domain.CashierShiftCashMovement, 0)
	for rows.Next() {
		var m domain.CashierShiftCashMovement
		if err := rows.Scan(
			&m.ID, &m.TenantID, &m.ShiftID, &m.MovementType, &m.Amount, &m.Reason,
			&m.AuthorizedBy, &m.AuthorizerName, &m.CreatedAt,
		); err != nil {
			return nil, fmt.Errorf("scan cash movement: %w", err)
		}
		movements = append(movements, m)
	}
	return movements, nil
}

// ListShifts retrieves history of shifts for an outlet.
func (r *PostgresPOSRepository) ListShifts(ctx context.Context, tenantID uuid.UUID, outletID *uuid.UUID, status *string, limit int) ([]domain.CashierShift, error) {
	if limit <= 0 {
		limit = 30
	}

	query := `
		SELECT 
			s.id, s.tenant_id, s.outlet_id, ot.code AS outlet_code, ot.name AS outlet_name,
			s.shift_number, s.cashier_user_id, u_c.full_name AS cashier_name,
			s.supervisor_user_id, u_s.full_name AS supervisor_name,
			s.shift_name, s.status, s.opened_at, s.closed_at,
			s.opening_cash, s.expected_cash, s.actual_cash, s.cash_difference,
			s.total_transactions, s.gross_sales, s.discounts, s.net_sales,
			s.tax_pb1, s.service_charge,
			s.payment_cash, s.payment_qris, s.payment_card, s.payment_transfer,
			s.total_paid_in, s.total_paid_out, s.notes, s.created_at, s.updated_at
		FROM cashier_shifts s
		JOIN outlets ot ON ot.id = s.outlet_id
		JOIN users u_c ON u_c.id = s.cashier_user_id
		LEFT JOIN users u_s ON u_s.id = s.supervisor_user_id
		WHERE s.tenant_id = $1 AND s.deleted_at IS NULL
		  AND ($2::UUID IS NULL OR s.outlet_id = $2)
		  AND ($3::TEXT IS NULL OR s.status = $3)
		ORDER BY s.opened_at DESC
		LIMIT $4
	`

	rows, err := r.txMgr.Conn(ctx).Query(ctx, query, tenantID, outletID, status, limit)
	if err != nil {
		return nil, fmt.Errorf("list shifts: %w", err)
	}
	defer rows.Close()

	shifts := make([]domain.CashierShift, 0)
	for rows.Next() {
		var s domain.CashierShift
		if err := rows.Scan(
			&s.ID, &s.TenantID, &s.OutletID, &s.OutletCode, &s.OutletName,
			&s.ShiftNumber, &s.CashierUserID, &s.CashierName,
			&s.SupervisorUserID, &s.SupervisorName,
			&s.ShiftName, &s.Status, &s.OpenedAt, &s.ClosedAt,
			&s.OpeningCash, &s.ExpectedCash, &s.ActualCash, &s.CashDifference,
			&s.TotalTransactions, &s.GrossSales, &s.Discounts, &s.NetSales,
			&s.TaxPB1, &s.ServiceCharge,
			&s.PaymentCash, &s.PaymentQRIS, &s.PaymentCard, &s.PaymentTransfer,
			&s.TotalPaidIn, &s.TotalPaidOut, &s.Notes, &s.CreatedAt, &s.UpdatedAt,
		); err != nil {
			return nil, fmt.Errorf("scan shift: %w", err)
		}

		if s.Status == "OPEN" {
			_ = r.populateLiveShiftTotals(ctx, &s)
		}
		shifts = append(shifts, s)
	}
	return shifts, nil
}

// GetShiftReport retrieves the shift data and movements formatted for X-Report or Z-Report.
func (r *PostgresPOSRepository) GetShiftReport(ctx context.Context, tenantID, shiftID uuid.UUID, reportType string, generatedBy string) (*domain.ShiftReportResponse, error) {
	shift, err := r.GetShiftByID(ctx, tenantID, shiftID)
	if err != nil {
		return nil, err
	}

	movements, err := r.ListCashMovements(ctx, tenantID, shiftID)
	if err != nil {
		return nil, err
	}

	return &domain.ShiftReportResponse{
		Shift:       *shift,
		Movements:   movements,
		ReportType:  reportType,
		GeneratedAt: time.Now(),
		GeneratedBy: generatedBy,
	}, nil
}

// VerifySupervisorPIN validates the supervisor PIN against users authorized for the outlet.
func (r *PostgresPOSRepository) VerifySupervisorPIN(ctx context.Context, tenantID uuid.UUID, outletID *uuid.UUID, pin string) (bool, string, *uuid.UUID, error) {
	query := `
		SELECT u.id, u.full_name, u.supervisor_pin_hash
		FROM user_role_assignments ura
		JOIN users u ON u.id = ura.user_id
		JOIN roles r ON r.id = ura.role_id
		WHERE ura.tenant_id = $1
		  AND (ura.outlet_id = $2 OR ura.outlet_id IS NULL)
		  AND r.code IN ('OWNER', 'OUTLET_MANAGER', 'SUPERVISOR')
		  AND u.supervisor_pin_hash IS NOT NULL
		  AND u.is_active = true
		  AND u.deleted_at IS NULL
	`

	rows, err := r.txMgr.Conn(ctx).Query(ctx, query, tenantID, outletID)
	if err != nil {
		return false, "", nil, fmt.Errorf("query supervisor PINs: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var uid uuid.UUID
		var fullName string
		var pinHash string
		if err := rows.Scan(&uid, &fullName, &pinHash); err != nil {
			return false, "", nil, err
		}
		if bcrypt.CompareHashAndPassword([]byte(pinHash), []byte(pin)) == nil {
			return true, fullName, &uid, nil
		}
	}

	return false, "", nil, nil
}

// -----------------------------------------------------------------------------
// Realtime Warehouse Stock Deduction & BOM Consumption
// -----------------------------------------------------------------------------

// deductStockForOrderTx executes realtime deduction of warehouse inventory items
// based on BOM recipes of menu items sold in the order.
//
// Strict Isolation Rules:
// 1. Idempotency: If ord.StockDeducted is true, returns immediately without re-deducting.
// 2. Strict R&D Isolation: Menu items in 'DRAFT' status or not available are strictly skipped.
//    Only active, published menu items deduct physical warehouse stock.
// 3. Sub-Recipe Cascading: Expands sub-recipes (e.g. homemade mushroom sauce) to deduct raw items.
// 4. Steak Modifiers: Modifiers like extra fries, veggie mix, or alternate sauce recorded in notes are deducted.
func (r *PostgresPOSRepository) deductStockForOrderTx(txCtx context.Context, tenantID uuid.UUID, ord *domain.Order) error {
	if ord == nil || ord.StockDeducted {
		return nil
	}

	// Double check database state to avoid race condition
	var alreadyDeducted bool
	if err := r.txMgr.Conn(txCtx).QueryRow(txCtx, `SELECT stock_deducted FROM orders WHERE id = $1`, ord.ID).Scan(&alreadyDeducted); err == nil && alreadyDeducted {
		ord.StockDeducted = true
		return nil
	}

	// Ensure order items are loaded
	items := ord.Items
	if len(items) == 0 {
		itemQuery := `
			SELECT id, order_id, menu_item_id, item_name, unit_price, quantity, subtotal, COALESCE(notes, ''), status
			FROM order_items
			WHERE order_id = $1 AND status != 'CANCELLED'
		`
		rows, err := r.txMgr.Conn(txCtx).Query(txCtx, itemQuery, ord.ID)
		if err != nil {
			return fmt.Errorf("fetch order items for deduction: %w", err)
		}

		for rows.Next() {
			var it domain.OrderItem
			if err := rows.Scan(&it.ID, &it.OrderID, &it.MenuItemID, &it.ItemName, &it.UnitPrice, &it.Quantity, &it.Subtotal, &it.Notes, &it.Status); err == nil {
				items = append(items, it)
			}
		}
		rows.Close()
	}

	for _, it := range items {
		if it.MenuItemID == uuid.Nil || it.Quantity <= 0 {
			continue
		}

		// 1. Strict R&D Isolation: Check menu item status and availability
		var miStatus string
		var isAvailable bool
		checkMenuQuery := `SELECT status, is_available FROM menu_items WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL`
		if err := r.txMgr.Conn(txCtx).QueryRow(txCtx, checkMenuQuery, tenantID, it.MenuItemID).Scan(&miStatus, &isAvailable); err != nil {
			continue
		}

		// Only active published menu items deduct physical warehouse stock!
		// Menus in 'DRAFT' (R&D simulation/costing stage) are strictly excluded from inventory deduction.
		if miStatus != "PUBLISHED" || !isAvailable {
			continue
		}

		// 2. Fetch recipe for this menu item
		var recipeID uuid.UUID
		var yieldPortions float64
		recipeQuery := `SELECT id, yield_portions FROM recipes WHERE tenant_id = $1 AND menu_item_id = $2 AND deleted_at IS NULL LIMIT 1`
		if err := r.txMgr.Conn(txCtx).QueryRow(txCtx, recipeQuery, tenantID, it.MenuItemID).Scan(&recipeID, &yieldPortions); err != nil {
			// No recipe attached to this menu item
			continue
		}
		if yieldPortions <= 0 {
			yieldPortions = 1
		}

		portionScale := float64(it.Quantity) / yieldPortions

		// 3. Fetch recipe ingredients
		ingQuery := `
			SELECT inventory_item_id, sub_recipe_id, COALESCE(gross_quantity, quantity, 0)
			FROM recipe_ingredients
			WHERE tenant_id = $1 AND recipe_id = $2 AND deleted_at IS NULL
		`
		ingRows, err := r.txMgr.Conn(txCtx).Query(txCtx, ingQuery, tenantID, recipeID)
		if err != nil {
			continue
		}

		type ingItem struct {
			inventoryItemID *uuid.UUID
			subRecipeID     *uuid.UUID
			qty             float64
		}
		var ingList []ingItem
		for ingRows.Next() {
			var ing ingItem
			if err := ingRows.Scan(&ing.inventoryItemID, &ing.subRecipeID, &ing.qty); err == nil {
				ingList = append(ingList, ing)
			}
		}
		ingRows.Close()

		for _, ing := range ingList {
			if ing.inventoryItemID != nil {
				deductQty := ing.qty * portionScale
				_ = r.deductInventoryItemTx(txCtx, tenantID, ord.OutletID, *ing.inventoryItemID, deductQty, ord.OrderNumber)
			} else if ing.subRecipeID != nil {
				// Expand sub-recipe
				var subYield float64
				if err := r.txMgr.Conn(txCtx).QueryRow(txCtx, `SELECT yield_portions FROM recipes WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL`, tenantID, *ing.subRecipeID).Scan(&subYield); err == nil {
					if subYield <= 0 {
						subYield = 1
					}
					subScale := (ing.qty * portionScale) / subYield

					subRows, err := r.txMgr.Conn(txCtx).Query(txCtx, `
						SELECT inventory_item_id, COALESCE(gross_quantity, quantity, 0)
						FROM recipe_ingredients
						WHERE tenant_id = $1 AND recipe_id = $2 AND inventory_item_id IS NOT NULL AND deleted_at IS NULL
					`, tenantID, *ing.subRecipeID)
					if err == nil {
						type subItem struct {
							invID uuid.UUID
							qty   float64
						}
						var subList []subItem
						for subRows.Next() {
							var subInvID uuid.UUID
							var subQty float64
							if err := subRows.Scan(&subInvID, &subQty); err == nil {
								subList = append(subList, subItem{invID: subInvID, qty: subQty})
							}
						}
						subRows.Close()

						for _, s := range subList {
							_ = r.deductInventoryItemTx(txCtx, tenantID, ord.OutletID, s.invID, s.qty*subScale, ord.OrderNumber)
						}
					}
				}
			}
		}

		// 4. Check for Steak Modifiers in it.Notes
		notesStr := ""
		if it.Notes != nil {
			notesStr = *it.Notes
		}
		r.handleModifierStockDeductionTx(txCtx, tenantID, ord.OutletID, notesStr, it.Quantity, ord.OrderNumber)
	}

	// Mark order as stock deducted
	now := time.Now()
	_, err := r.txMgr.Conn(txCtx).Exec(txCtx, `
		UPDATE orders
		SET stock_deducted = true, stock_deducted_at = $1, updated_at = now()
		WHERE id = $2
	`, now, ord.ID)
	if err != nil {
		return fmt.Errorf("mark order stock_deducted: %w", err)
	}

	ord.StockDeducted = true
	ord.StockDeductedAt = &now
	return nil
}

// deductInventoryItemTx reduces physical inventory in an outlet's warehouse and creates a POS_SALES_DEDUCTION ledger record.
func (r *PostgresPOSRepository) deductInventoryItemTx(
	txCtx context.Context,
	tenantID, outletID, itemID uuid.UUID,
	qty float64,
	orderNumber string,
) error {
	if qty <= 0 {
		return nil
	}

	// 1. Locate best warehouse for this outlet (prefer warehouse with existing positive stock)
	var warehouseID uuid.UUID
	var unitCost float64
	var currentBalance float64

	findWhQuery := `
		SELECT sb.warehouse_id, sb.quantity, ii.cost_price
		FROM stock_balances sb
		JOIN warehouses w ON w.id = sb.warehouse_id
		JOIN inventory_items ii ON ii.id = sb.item_id
		WHERE sb.tenant_id = $1 AND sb.item_id = $2 AND w.outlet_id = $3 AND w.is_active = true
		ORDER BY sb.quantity DESC, w.created_at ASC
		LIMIT 1
	`
	err := r.txMgr.Conn(txCtx).QueryRow(txCtx, findWhQuery, tenantID, itemID, outletID).Scan(&warehouseID, &currentBalance, &unitCost)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			// Fallback: pick primary active warehouse of this outlet
			fallbackWhQuery := `
				SELECT w.id, COALESCE(ii.cost_price, 0)
				FROM warehouses w
				LEFT JOIN inventory_items ii ON ii.id = $2 AND ii.tenant_id = $1
				WHERE w.tenant_id = $1 AND w.outlet_id = $3 AND w.is_active = true
				ORDER BY CASE WHEN w.warehouse_type IN ('OUTLET_STORAGE', 'CHILLER') THEN 1 ELSE 2 END, w.created_at ASC
				LIMIT 1
			`
			if errFallback := r.txMgr.Conn(txCtx).QueryRow(txCtx, fallbackWhQuery, tenantID, itemID, outletID).Scan(&warehouseID, &unitCost); errFallback != nil {
				// No warehouse found for this outlet, skip safely
				return nil
			}
		} else {
			return fmt.Errorf("lookup warehouse for item %s: %w", itemID, err)
		}
	}

	// 2. Ensure stock_balances record exists
	_, err = r.txMgr.Conn(txCtx).Exec(txCtx, `
		INSERT INTO stock_balances (tenant_id, warehouse_id, item_id, quantity)
		VALUES ($1, $2, $3, 0)
		ON CONFLICT (tenant_id, warehouse_id, item_id) DO NOTHING
	`, tenantID, warehouseID, itemID)
	if err != nil {
		return fmt.Errorf("upsert stock balance: %w", err)
	}

	// 3. Deduct stock balance
	var balanceAfter float64
	err = r.txMgr.Conn(txCtx).QueryRow(txCtx, `
		UPDATE stock_balances
		SET quantity = GREATEST(0, quantity - $1), updated_at = now()
		WHERE tenant_id = $2 AND warehouse_id = $3 AND item_id = $4
		RETURNING quantity
	`, qty, tenantID, warehouseID, itemID).Scan(&balanceAfter)
	if err != nil {
		return fmt.Errorf("update warehouse balance: %w", err)
	}

	// 4. Update overall inventory item stock
	_, err = r.txMgr.Conn(txCtx).Exec(txCtx, `
		UPDATE inventory_items
		SET current_stock = GREATEST(0, current_stock - $1), updated_at = now()
		WHERE tenant_id = $2 AND id = $3
	`, qty, tenantID, itemID)
	if err != nil {
		return fmt.Errorf("update inventory item current stock: %w", err)
	}

	// 5. Record movement in immutable ledger
	movementQuery := `
		INSERT INTO stock_movements (
			tenant_id, warehouse_id, item_id, movement_type, reference_id, quantity_change, balance_after, unit_cost
		) VALUES (
			$1, $2, $3, 'POS_SALES_DEDUCTION', $4, $5, $6, $7
		)
	`
	_, err = r.txMgr.Conn(txCtx).Exec(txCtx, movementQuery, tenantID, warehouseID, itemID, orderNumber, -qty, balanceAfter, unitCost)
	if err != nil {
		return fmt.Errorf("record pos sales stock movement: %w", err)
	}

	return nil
}

// deductItemByCodeTx looks up an inventory item by its business code and deducts the quantity.
func (r *PostgresPOSRepository) deductItemByCodeTx(txCtx context.Context, tenantID, outletID uuid.UUID, code string, qty float64, orderNumber string) error {
	var itemID uuid.UUID
	err := r.txMgr.Conn(txCtx).QueryRow(txCtx, `SELECT id FROM inventory_items WHERE tenant_id = $1 AND code = $2 AND deleted_at IS NULL LIMIT 1`, tenantID, code).Scan(&itemID)
	if err != nil {
		return nil
	}
	return r.deductInventoryItemTx(txCtx, tenantID, outletID, itemID, qty, orderNumber)
}

// handleModifierStockDeductionTx parses modifier tags from notes and deducts supplemental or alternative ingredients.
func (r *PostgresPOSRepository) handleModifierStockDeductionTx(txCtx context.Context, tenantID, outletID uuid.UUID, notes string, itemQty int, orderNumber string) {
	if notes == "" || itemQty <= 0 {
		return
	}
	upper := strings.ToUpper(notes)
	qtyF := float64(itemQty)

	// Extra veggies modifier
	if strings.Contains(upper, "EXTRA VEGGIES") || strings.Contains(upper, "EXTRA SAYUR") {
		_ = r.deductItemByCodeTx(txCtx, tenantID, outletID, "ING-VEG-MIX", 1.0*qtyF, orderNumber)
	}

	// French Fries modifier (e.g. 150g upgrade from 100g base)
	if strings.Contains(upper, "FRENCH FRIES (150G)") || strings.Contains(upper, "FRIES 150G") || strings.Contains(upper, "EXTRA FRIES") {
		_ = r.deductItemByCodeTx(txCtx, tenantID, outletID, "ING-FRIES", 0.050*qtyF, orderNumber)
	}

	// BBQ Sauce substitution/choice
	if strings.Contains(upper, "BBQ HOUSE SAUCE") || strings.Contains(upper, "SAUS BBQ") {
		_ = r.deductItemByCodeTx(txCtx, tenantID, outletID, "ING-SAUCE-BBQ-JADI", 0.060*qtyF, orderNumber)
	}

	// Mushroom Sauce substitution/choice
	if strings.Contains(upper, "MUSHROOM CREAM SAUCE") || strings.Contains(upper, "CREAMY MUSHROOM") {
		_ = r.deductItemByCodeTx(txCtx, tenantID, outletID, "ING-BUTTER", 0.005*qtyF, orderNumber)
		_ = r.deductItemByCodeTx(txCtx, tenantID, outletID, "ING-CREAM", 0.040*qtyF, orderNumber)
		_ = r.deductItemByCodeTx(txCtx, tenantID, outletID, "ING-MUSH-CHAMP", 0.0238*qtyF, orderNumber)
	}
}
