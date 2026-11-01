package repository

import (
	"context"
	"database/sql"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"tropical-fnb/backend/internal/modules/inventory/domain"
	"tropical-fnb/backend/internal/modules/inventory/engine"
	"tropical-fnb/backend/internal/platform/database"
)

// CascadingHPARecalculator triggers downstream Sub-Recipe and Menu HPA recalculations when raw item costs change.
type CascadingHPARecalculator interface {
	RecalculateCascadingHPA(ctx context.Context, tenantID uuid.UUID, itemID *uuid.UUID, subRecipeID *uuid.UUID) error
}

type InventoryRepo struct {
	txMgr     *database.TxManager
	hpaRecalc CascadingHPARecalculator
}

func NewInventoryRepo(txMgr *database.TxManager) *InventoryRepo {
	return &InventoryRepo{txMgr: txMgr}
}

func (r *InventoryRepo) SetHPARecalculator(recalc CascadingHPARecalculator) {
	r.hpaRecalc = recalc
}

func (r *InventoryRepo) conn(ctx context.Context) database.DBTX {
	return r.txMgr.Conn(ctx)
}

// ------------------------------------------------------------- Warehouses ---

func (r *InventoryRepo) ListWarehouses(ctx context.Context, tenantID uuid.UUID, outletID *uuid.UUID) ([]domain.Warehouse, error) {
	query := `
		SELECT w.id, w.tenant_id, w.outlet_id, o.code AS outlet_code, o.name AS outlet_name,
		       w.code, w.name, w.warehouse_type, w.address, w.pic_name, w.is_active,
		       w.created_at, w.updated_at,
		       COUNT(DISTINCT sb.item_id) AS item_count,
		       COALESCE(SUM(sb.quantity * ii.cost_price), 0) AS total_stock_value
		  FROM warehouses w
		  LEFT JOIN outlets o ON o.id = w.outlet_id
		  LEFT JOIN stock_balances sb ON sb.warehouse_id = w.id
		  LEFT JOIN inventory_items ii ON ii.id = sb.item_id
		 WHERE w.tenant_id = $1 AND w.deleted_at IS NULL
		   AND ($2::uuid IS NULL OR w.outlet_id = $2 OR w.outlet_id IS NULL)
		 GROUP BY w.id, o.code, o.name
		 ORDER BY CASE WHEN w.warehouse_type = 'CENTRAL_KITCHEN' THEN 0 ELSE 1 END, w.name ASC
	`
	rows, err := r.conn(ctx).Query(ctx, query, tenantID, outletID)
	if err != nil {
		return nil, fmt.Errorf("list warehouses: %w", err)
	}
	defer rows.Close()

	result := make([]domain.Warehouse, 0)
	for rows.Next() {
		var w domain.Warehouse
		var outletCode, outletName, address, picName sql.NullString
		err := rows.Scan(
			&w.ID, &w.TenantID, &w.OutletID, &outletCode, &outletName,
			&w.Code, &w.Name, &w.WarehouseType, &address, &picName, &w.IsActive,
			&w.CreatedAt, &w.UpdatedAt, &w.ItemCount, &w.TotalStockVal,
		)
		if err != nil {
			return nil, fmt.Errorf("scan warehouse: %w", err)
		}
		if outletCode.Valid {
			w.OutletCode = &outletCode.String
		}
		if outletName.Valid {
			w.OutletName = &outletName.String
		}
		if address.Valid {
			w.Address = &address.String
		}
		if picName.Valid {
			w.PicName = &picName.String
		}
		result = append(result, w)
	}
	return result, nil
}

func (r *InventoryRepo) GetWarehouse(ctx context.Context, tenantID, id uuid.UUID) (*domain.Warehouse, error) {
	query := `
		SELECT w.id, w.tenant_id, w.outlet_id, o.code AS outlet_code, o.name AS outlet_name,
		       w.code, w.name, w.warehouse_type, w.address, w.pic_name, w.is_active,
		       w.created_at, w.updated_at
		  FROM warehouses w
		  LEFT JOIN outlets o ON o.id = w.outlet_id
		 WHERE w.tenant_id = $1 AND w.id = $2 AND w.deleted_at IS NULL
	`
	var w domain.Warehouse
	var outletCode, outletName, address, picName sql.NullString
	err := r.conn(ctx).QueryRow(ctx, query, tenantID, id).Scan(
		&w.ID, &w.TenantID, &w.OutletID, &outletCode, &outletName,
		&w.Code, &w.Name, &w.WarehouseType, &address, &picName, &w.IsActive,
		&w.CreatedAt, &w.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, domain.NotFound("gudang tidak ditemukan")
		}
		return nil, fmt.Errorf("get warehouse: %w", err)
	}
	if outletCode.Valid {
		w.OutletCode = &outletCode.String
	}
	if outletName.Valid {
		w.OutletName = &outletName.String
	}
	if address.Valid {
		w.Address = &address.String
	}
	if picName.Valid {
		w.PicName = &picName.String
	}
	return &w, nil
}

func (r *InventoryRepo) CreateWarehouse(ctx context.Context, w domain.Warehouse) (*domain.Warehouse, error) {
	query := `
		INSERT INTO warehouses (tenant_id, outlet_id, code, name, warehouse_type, address, pic_name, is_active)
		VALUES ($1, $2, UPPER($3), $4, $5, $6, $7, true)
		RETURNING id, code, created_at, updated_at
	`
	err := r.conn(ctx).QueryRow(ctx, query,
		w.TenantID, w.OutletID, w.Code, w.Name, w.WarehouseType, w.Address, w.PicName,
	).Scan(&w.ID, &w.Code, &w.CreatedAt, &w.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("create warehouse: %w", err)
	}
	w.IsActive = true
	return &w, nil
}

func (r *InventoryRepo) UpdateWarehouse(ctx context.Context, tenantID, id uuid.UUID, name string, whType domain.WarehouseType, address, picName *string, isActive bool) (*domain.Warehouse, error) {
	query := `
		UPDATE warehouses
		   SET name = $1, warehouse_type = $2, address = $3, pic_name = $4, is_active = $5, updated_at = now()
		 WHERE tenant_id = $6 AND id = $7 AND deleted_at IS NULL
		RETURNING id, tenant_id, outlet_id, code, name, warehouse_type, address, pic_name, is_active, created_at, updated_at
	`
	var w domain.Warehouse
	var addr, pic sql.NullString
	err := r.conn(ctx).QueryRow(ctx, query, name, whType, address, picName, isActive, tenantID, id).Scan(
		&w.ID, &w.TenantID, &w.OutletID, &w.Code, &w.Name, &w.WarehouseType, &addr, &pic, &w.IsActive, &w.CreatedAt, &w.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, domain.NotFound("gudang tidak ditemukan")
		}
		return nil, fmt.Errorf("update warehouse: %w", err)
	}
	if addr.Valid {
		w.Address = &addr.String
	}
	if pic.Valid {
		w.PicName = &pic.String
	}
	return &w, nil
}

func (r *InventoryRepo) DeleteWarehouse(ctx context.Context, tenantID, id uuid.UUID) error {
	var totalStock float64
	err := r.conn(ctx).QueryRow(ctx, `
		SELECT COALESCE(SUM(quantity), 0)
		  FROM stock_balances
		 WHERE tenant_id = $1 AND warehouse_id = $2
	`, tenantID, id).Scan(&totalStock)
	if err != nil {
		return fmt.Errorf("check warehouse stock before delete: %w", err)
	}
	if totalStock > 0.0001 {
		return domain.Validation("Gudang tidak dapat dihapus karena masih terdapat sisa saldo stok fisik (%.2f unit). Kosongkan atau mutasikan saldo ke gudang lain terlebih dahulu.", totalStock)
	}

	res, err := r.conn(ctx).Exec(ctx, `
		UPDATE warehouses SET deleted_at = now(), updated_at = now()
		 WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL
	`, tenantID, id)
	if err != nil {
		return fmt.Errorf("delete warehouse: %w", err)
	}
	if res.RowsAffected() == 0 {
		return domain.NotFound("gudang tidak ditemukan")
	}
	return nil
}

// --------------------------------------------------------- Stock Balances ---

func (r *InventoryRepo) ListStockBalances(ctx context.Context, tenantID, warehouseID uuid.UUID) ([]domain.StockBalance, error) {
	query := `
		SELECT sb.id, sb.tenant_id, sb.warehouse_id, w.code AS wh_code, w.name AS wh_name,
		       sb.item_id, ii.code AS item_code, ii.name AS item_name,
		       COALESCE(ic.name, 'Umum') AS cat_name, ii.unit, ii.storage_type,
		       ii.cost_price, sb.quantity, sb.reserved_quantity,
		       (sb.quantity - sb.reserved_quantity) AS available_quantity,
		       sb.min_stock_alert, sb.max_stock_capacity,
		       CASE
		           WHEN sb.quantity <= 0 THEN 'OUT_OF_STOCK'
		           WHEN sb.quantity <= sb.min_stock_alert THEN 'LOW_STOCK'
		           ELSE 'OK'
		       END AS stock_status,
		       (sb.quantity * ii.cost_price) AS total_value,
		       sb.last_counted_at, sb.updated_at
		  FROM stock_balances sb
		  JOIN warehouses w ON w.id = sb.warehouse_id
		  JOIN inventory_items ii ON ii.id = sb.item_id
		  LEFT JOIN inventory_categories ic ON ic.id = ii.category_id
		 WHERE sb.tenant_id = $1 AND sb.warehouse_id = $2
		 ORDER BY CASE WHEN sb.quantity <= sb.min_stock_alert THEN 0 ELSE 1 END, ii.name ASC
	`
	rows, err := r.conn(ctx).Query(ctx, query, tenantID, warehouseID)
	if err != nil {
		return nil, fmt.Errorf("list stock balances: %w", err)
	}
	defer rows.Close()

	result := make([]domain.StockBalance, 0)
	for rows.Next() {
		var sb domain.StockBalance
		err := rows.Scan(
			&sb.ID, &sb.TenantID, &sb.WarehouseID, &sb.WarehouseCode, &sb.WarehouseName,
			&sb.ItemID, &sb.ItemCode, &sb.ItemName, &sb.CategoryName, &sb.Unit, &sb.StorageType,
			&sb.CostPrice, &sb.Quantity, &sb.ReservedQuantity, &sb.AvailableQuantity,
			&sb.MinStockAlert, &sb.MaxStockCapacity, &sb.StockStatus, &sb.TotalValue,
			&sb.LastCountedAt, &sb.UpdatedAt,
		)
		if err != nil {
			return nil, fmt.Errorf("scan stock balance: %w", err)
		}
		result = append(result, sb)
	}
	return result, nil
}

func (r *InventoryRepo) ListInventoryItems(ctx context.Context, tenantID uuid.UUID) ([]domain.InventoryItem, error) {
	query := `
		SELECT ii.id, ii.tenant_id, ii.category_id, COALESCE(ic.name, 'Umum') AS cat_name,
		       ii.code, ii.name, ii.unit, ii.storage_type, ii.cost_price,
		       ii.current_stock, ii.min_stock_alert, ii.is_active
		  FROM inventory_items ii
		  LEFT JOIN inventory_categories ic ON ic.id = ii.category_id
		 WHERE ii.tenant_id = $1 AND ii.is_active = true AND ii.deleted_at IS NULL
		 ORDER BY ii.name ASC
	`
	rows, err := r.conn(ctx).Query(ctx, query, tenantID)
	if err != nil {
		return nil, fmt.Errorf("list inventory items: %w", err)
	}
	defer rows.Close()

	result := make([]domain.InventoryItem, 0)
	for rows.Next() {
		var it domain.InventoryItem
		if err := rows.Scan(
			&it.ID, &it.TenantID, &it.CategoryID, &it.CategoryName,
			&it.Code, &it.Name, &it.Unit, &it.StorageType, &it.CostPrice,
			&it.CurrentStock, &it.MinStockAlert, &it.IsActive,
		); err != nil {
			return nil, fmt.Errorf("scan inventory item: %w", err)
		}
		result = append(result, it)
	}
	return result, nil
}

func (r *InventoryRepo) AdjustStockBalance(ctx context.Context, tenantID, warehouseID, itemID uuid.UUID, deltaQty float64) (float64, error) {
	query := `
		INSERT INTO stock_balances (tenant_id, warehouse_id, item_id, quantity, updated_at)
		VALUES ($1, $2, $3, GREATEST(0, $4), now())
		ON CONFLICT (tenant_id, warehouse_id, item_id)
		DO UPDATE SET quantity = GREATEST(0, stock_balances.quantity + EXCLUDED.quantity), updated_at = now()
		RETURNING quantity
	`
	var newQty float64
	err := r.conn(ctx).QueryRow(ctx, query, tenantID, warehouseID, itemID, deltaQty).Scan(&newQty)
	if err != nil {
		return 0, fmt.Errorf("adjust stock balance: %w", err)
	}
	return newQty, nil
}

func (r *InventoryRepo) UpdateItemCostPrice(ctx context.Context, tenantID, itemID uuid.UUID, newMac float64) error {
	query := `UPDATE inventory_items SET cost_price = $1, updated_at = now() WHERE tenant_id = $2 AND id = $3`
	_, err := r.conn(ctx).Exec(ctx, query, newMac, tenantID, itemID)
	return err
}

func (r *InventoryRepo) RecordStockMovement(ctx context.Context, tenantID, warehouseID, itemID uuid.UUID, movementType, refID string, qtyChange, balanceAfter, unitCost float64) error {
	query := `
		INSERT INTO stock_movements (tenant_id, warehouse_id, item_id, movement_type, reference_id, quantity_change, balance_after, unit_cost)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
	`
	_, err := r.conn(ctx).Exec(ctx, query, tenantID, warehouseID, itemID, movementType, refID, qtyChange, balanceAfter, unitCost)
	return err
}

// -------------------------------------------------------------- Suppliers ---

func (r *InventoryRepo) ListSuppliers(ctx context.Context, tenantID uuid.UUID) ([]domain.Supplier, error) {
	query := `
		SELECT id, tenant_id, code, name, category, contact_person, phone, email, address,
		       term_of_payment_days, bank_name, bank_account_number, bank_account_holder,
		       is_active, created_at, updated_at
		  FROM suppliers
		 WHERE tenant_id = $1 AND deleted_at IS NULL
		 ORDER BY name ASC
	`
	rows, err := r.conn(ctx).Query(ctx, query, tenantID)
	if err != nil {
		return nil, fmt.Errorf("list suppliers: %w", err)
	}
	defer rows.Close()

	result := make([]domain.Supplier, 0)
	for rows.Next() {
		var s domain.Supplier
		var cp, phone, email, addr, bank, accNo, accHolder sql.NullString
		err := rows.Scan(
			&s.ID, &s.TenantID, &s.Code, &s.Name, &s.Category, &cp, &phone, &email, &addr,
			&s.TermOfPaymentDays, &bank, &accNo, &accHolder, &s.IsActive, &s.CreatedAt, &s.UpdatedAt,
		)
		if err != nil {
			return nil, fmt.Errorf("scan supplier: %w", err)
		}
		if cp.Valid {
			s.ContactPerson = &cp.String
		}
		if phone.Valid {
			s.Phone = &phone.String
		}
		if email.Valid {
			s.Email = &email.String
		}
		if addr.Valid {
			s.Address = &addr.String
		}
		if bank.Valid {
			s.BankName = &bank.String
		}
		if accNo.Valid {
			s.BankAccountNumber = &accNo.String
		}
		if accHolder.Valid {
			s.BankAccountHolder = &accHolder.String
		}
		result = append(result, s)
	}
	return result, nil
}

func (r *InventoryRepo) CreateSupplier(ctx context.Context, s domain.Supplier) (*domain.Supplier, error) {
	query := `
		INSERT INTO suppliers (tenant_id, code, name, category, contact_person, phone, email, address,
		                       term_of_payment_days, bank_name, bank_account_number, bank_account_holder)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
		RETURNING id, created_at, updated_at
	`
	err := r.conn(ctx).QueryRow(ctx, query,
		s.TenantID, s.Code, s.Name, s.Category, s.ContactPerson, s.Phone, s.Email, s.Address,
		s.TermOfPaymentDays, s.BankName, s.BankAccountNumber, s.BankAccountHolder,
	).Scan(&s.ID, &s.CreatedAt, &s.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("create supplier: %w", err)
	}
	return &s, nil
}

// -------------------------------------------------------- Purchase Orders ---

func (r *InventoryRepo) ListPurchaseOrders(ctx context.Context, tenantID uuid.UUID, warehouseID *uuid.UUID, status *string) ([]domain.PurchaseOrder, error) {
	query := `
		SELECT po.id, po.tenant_id, po.outlet_id, o.name AS outlet_name,
		       po.warehouse_id, w.name AS wh_name, po.supplier_id, s.name AS sup_name,
		       po.po_number, po.order_date::text, po.expected_delivery_date::text,
		       po.status, po.subtotal_amount, po.tax_amount, po.total_amount, po.notes,
		       po.created_at, po.updated_at
		  FROM purchase_orders po
		  JOIN outlets o ON o.id = po.outlet_id
		  JOIN warehouses w ON w.id = po.warehouse_id
		  JOIN suppliers s ON s.id = po.supplier_id
		 WHERE po.tenant_id = $1
		   AND ($2::uuid IS NULL OR po.warehouse_id = $2)
		   AND ($3::text IS NULL OR po.status = $3)
		 ORDER BY po.order_date DESC, po.created_at DESC
	`
	rows, err := r.conn(ctx).Query(ctx, query, tenantID, warehouseID, status)
	if err != nil {
		return nil, fmt.Errorf("list purchase orders: %w", err)
	}
	defer rows.Close()

	result := make([]domain.PurchaseOrder, 0)
	for rows.Next() {
		var po domain.PurchaseOrder
		var notes sql.NullString
		err := rows.Scan(
			&po.ID, &po.TenantID, &po.OutletID, &po.OutletName,
			&po.WarehouseID, &po.WarehouseName, &po.SupplierID, &po.SupplierName,
			&po.PONumber, &po.OrderDate, &po.ExpectedDeliveryDate, &po.Status,
			&po.SubtotalAmount, &po.TaxAmount, &po.TotalAmount, &notes,
			&po.CreatedAt, &po.UpdatedAt,
		)
		if err != nil {
			return nil, fmt.Errorf("scan purchase order: %w", err)
		}
		if notes.Valid {
			po.Notes = &notes.String
		}
		result = append(result, po)
	}
	return result, nil
}

func (r *InventoryRepo) GetPurchaseOrder(ctx context.Context, tenantID, id uuid.UUID) (*domain.PurchaseOrder, error) {
	query := `
		SELECT po.id, po.tenant_id, po.outlet_id, o.name AS outlet_name,
		       po.warehouse_id, w.name AS wh_name, po.supplier_id, s.name AS sup_name,
		       po.po_number, po.order_date::text, po.expected_delivery_date::text,
		       po.status, po.subtotal_amount, po.tax_amount, po.total_amount, po.notes,
		       po.created_at, po.updated_at
		  FROM purchase_orders po
		  JOIN outlets o ON o.id = po.outlet_id
		  JOIN warehouses w ON w.id = po.warehouse_id
		  JOIN suppliers s ON s.id = po.supplier_id
		 WHERE po.tenant_id = $1 AND po.id = $2
	`
	var po domain.PurchaseOrder
	var notes sql.NullString
	err := r.conn(ctx).QueryRow(ctx, query, tenantID, id).Scan(
		&po.ID, &po.TenantID, &po.OutletID, &po.OutletName,
		&po.WarehouseID, &po.WarehouseName, &po.SupplierID, &po.SupplierName,
		&po.PONumber, &po.OrderDate, &po.ExpectedDeliveryDate, &po.Status,
		&po.SubtotalAmount, &po.TaxAmount, &po.TotalAmount, &notes,
		&po.CreatedAt, &po.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, domain.NotFound("Purchase Order tidak ditemukan")
		}
		return nil, fmt.Errorf("get purchase order: %w", err)
	}
	if notes.Valid {
		po.Notes = &notes.String
	}
	po.Items = make([]domain.PurchaseOrderItem, 0)

	// Fetch items
	itemsQuery := `
		SELECT poi.id, poi.purchase_order_id, poi.item_id, ii.code, ii.name,
		       poi.ordered_qty, poi.unit, poi.unit_price, poi.subtotal, poi.received_qty
		  FROM purchase_order_items poi
		  JOIN inventory_items ii ON ii.id = poi.item_id
		 WHERE poi.purchase_order_id = $1
		 ORDER BY ii.name ASC
	`
	rows, err := r.conn(ctx).Query(ctx, itemsQuery, po.ID)
	if err != nil {
		return nil, fmt.Errorf("get po items: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var it domain.PurchaseOrderItem
		if err := rows.Scan(
			&it.ID, &it.PurchaseOrderID, &it.ItemID, &it.ItemCode, &it.ItemName,
			&it.OrderedQty, &it.Unit, &it.UnitPrice, &it.Subtotal, &it.ReceivedQty,
		); err != nil {
			return nil, fmt.Errorf("scan po item: %w", err)
		}
		po.Items = append(po.Items, it)
	}
	return &po, nil
}

func (r *InventoryRepo) CreatePurchaseOrder(ctx context.Context, po domain.PurchaseOrder) (*domain.PurchaseOrder, error) {
	err := r.txMgr.WithTx(ctx, func(txCtx context.Context) error {
		conn := r.conn(txCtx)

		insertPo := `
			INSERT INTO purchase_orders (tenant_id, outlet_id, warehouse_id, supplier_id, po_number,
			                             order_date, expected_delivery_date, status, subtotal_amount,
			                             tax_amount, total_amount, notes)
			VALUES ($1, $2, $3, $4, $5, $6::date, $7::date, $8, $9, $10, $11, $12)
			RETURNING id, created_at, updated_at
		`
		err := conn.QueryRow(txCtx, insertPo,
			po.TenantID, po.OutletID, po.WarehouseID, po.SupplierID, po.PONumber,
			po.OrderDate, po.ExpectedDeliveryDate, po.Status, po.SubtotalAmount,
			po.TaxAmount, po.TotalAmount, po.Notes,
		).Scan(&po.ID, &po.CreatedAt, &po.UpdatedAt)
		if err != nil {
			return fmt.Errorf("insert po: %w", err)
		}

		insertPoi := `
			INSERT INTO purchase_order_items (tenant_id, purchase_order_id, item_id, ordered_qty, unit, unit_price, subtotal)
			VALUES ($1, $2, $3, $4, $5, $6, $7)
			RETURNING id
		`
		for i := range po.Items {
			po.Items[i].PurchaseOrderID = po.ID
			err = conn.QueryRow(txCtx, insertPoi,
				po.TenantID, po.ID, po.Items[i].ItemID, po.Items[i].OrderedQty,
				po.Items[i].Unit, po.Items[i].UnitPrice, po.Items[i].Subtotal,
			).Scan(&po.Items[i].ID)
			if err != nil {
				return fmt.Errorf("insert po item: %w", err)
			}
		}
		return nil
	})

	if err != nil {
		return nil, err
	}
	return &po, nil
}

func (r *InventoryRepo) UpdatePOStatus(ctx context.Context, tenantID, poID uuid.UUID, status domain.PurchaseOrderStatus) error {
	query := `UPDATE purchase_orders SET status = $1, updated_at = now() WHERE tenant_id = $2 AND id = $3`
	_, err := r.conn(ctx).Exec(ctx, query, status, tenantID, poID)
	return err
}

// --------------------------------------------------------- Goods Receipts ---

func (r *InventoryRepo) ListGoodsReceipts(ctx context.Context, tenantID uuid.UUID, warehouseID *uuid.UUID) ([]domain.GoodsReceipt, error) {
	query := `
		SELECT gr.id, gr.tenant_id, gr.receipt_number, gr.purchase_order_id, po.po_number,
		       gr.supplier_id, s.name AS sup_name, gr.warehouse_id, w.name AS wh_name,
		       gr.received_date::text, gr.received_time, gr.invoice_number,
		       gr.total_billed_amount, gr.total_actual_amount, gr.photo_url, gr.notes,
		       gr.received_by_name, gr.created_at, gr.updated_at
		  FROM goods_receipts gr
		  LEFT JOIN purchase_orders po ON po.id = gr.purchase_order_id
		  JOIN suppliers s ON s.id = gr.supplier_id
		  JOIN warehouses w ON w.id = gr.warehouse_id
		 WHERE gr.tenant_id = $1
		   AND ($2::uuid IS NULL OR gr.warehouse_id = $2)
		 ORDER BY gr.received_date DESC, gr.received_time DESC
	`
	rows, err := r.conn(ctx).Query(ctx, query, tenantID, warehouseID)
	if err != nil {
		return nil, fmt.Errorf("list goods receipts: %w", err)
	}
	defer rows.Close()

	result := make([]domain.GoodsReceipt, 0)
	for rows.Next() {
		var gr domain.GoodsReceipt
		var poNum, invNum, photo, notes, rcvByName sql.NullString
		err := rows.Scan(
			&gr.ID, &gr.TenantID, &gr.ReceiptNumber, &gr.PurchaseOrderID, &poNum,
			&gr.SupplierID, &gr.SupplierName, &gr.WarehouseID, &gr.WarehouseName,
			&gr.ReceivedDate, &gr.ReceivedTime, &invNum, &gr.TotalBilledAmount,
			&gr.TotalActualAmount, &photo, &notes, &rcvByName, &gr.CreatedAt, &gr.UpdatedAt,
		)
		if err != nil {
			return nil, fmt.Errorf("scan goods receipt: %w", err)
		}
		if poNum.Valid {
			gr.PONumber = &poNum.String
		}
		if invNum.Valid {
			gr.InvoiceNumber = &invNum.String
		}
		if photo.Valid {
			gr.PhotoURL = &photo.String
		}
		if notes.Valid {
			gr.Notes = &notes.String
		}
		if rcvByName.Valid {
			gr.ReceivedByName = &rcvByName.String
		}
		result = append(result, gr)
	}
	return result, nil
}

func (r *InventoryRepo) CreateGoodsReceipt(ctx context.Context, gr domain.GoodsReceipt) (*domain.GoodsReceipt, error) {
	err := r.txMgr.WithTx(ctx, func(txCtx context.Context) error {
		conn := r.conn(txCtx)

		insertGr := `
			INSERT INTO goods_receipts (tenant_id, receipt_number, purchase_order_id, supplier_id,
			                            warehouse_id, received_date, invoice_number, total_billed_amount,
			                            total_actual_amount, photo_url, notes, received_by_name)
			VALUES ($1, $2, $3, $4, $5, $6::date, $7, $8, $9, $10, $11, $12)
			RETURNING id, received_time, created_at, updated_at
		`
		err := conn.QueryRow(txCtx, insertGr,
			gr.TenantID, gr.ReceiptNumber, gr.PurchaseOrderID, gr.SupplierID,
			gr.WarehouseID, gr.ReceivedDate, gr.InvoiceNumber, gr.TotalBilledAmount,
			gr.TotalActualAmount, gr.PhotoURL, gr.Notes, gr.ReceivedByName,
		).Scan(&gr.ID, &gr.ReceivedTime, &gr.CreatedAt, &gr.UpdatedAt)
		if err != nil {
			return fmt.Errorf("insert goods receipt: %w", err)
		}

		insertGri := `
			INSERT INTO goods_receipt_items (tenant_id, goods_receipt_id, po_item_id, item_id,
			                                billed_qty, actual_weight_qty, variance_weight_qty, unit,
			                                unit_cost, subtotal_cost, reject_qty, reject_reason, batch_number)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
			RETURNING id
		`

		for i := range gr.Items {
			gr.Items[i].GoodsReceiptID = gr.ID
			err = conn.QueryRow(txCtx, insertGri,
				gr.TenantID, gr.ID, gr.Items[i].POItemID, gr.Items[i].ItemID,
				gr.Items[i].BilledQty, gr.Items[i].ActualWeightQty, gr.Items[i].VarianceWeightQty,
				gr.Items[i].Unit, gr.Items[i].UnitCost, gr.Items[i].SubtotalCost,
				gr.Items[i].RejectQty, gr.Items[i].RejectReason, gr.Items[i].BatchNumber,
			).Scan(&gr.Items[i].ID)
			if err != nil {
				return fmt.Errorf("insert gri item: %w", err)
			}

			// Update stock balance in warehouse
			netAcceptedWeight := gr.Items[i].ActualWeightQty - gr.Items[i].RejectQty
			var currentStock, currentCost float64
			_ = conn.QueryRow(txCtx, `SELECT quantity, cost_price FROM stock_balances sb JOIN inventory_items ii ON ii.id = sb.item_id WHERE sb.tenant_id = $1 AND sb.warehouse_id = $2 AND sb.item_id = $3`,
				gr.TenantID, gr.WarehouseID, gr.Items[i].ItemID).Scan(&currentStock, &currentCost)

			// Calculate Moving Average Cost (MAC)
			newMac := engine.CalculateMovingAverageCost(currentStock, currentCost, netAcceptedWeight, gr.Items[i].UnitCost)

			// Adjust stock balance
			var updatedStock float64
			err = conn.QueryRow(txCtx, `
				INSERT INTO stock_balances (tenant_id, warehouse_id, item_id, quantity, updated_at)
				VALUES ($1, $2, $3, $4, now())
				ON CONFLICT (tenant_id, warehouse_id, item_id)
				DO UPDATE SET quantity = stock_balances.quantity + EXCLUDED.quantity, updated_at = now()
				RETURNING quantity
			`, gr.TenantID, gr.WarehouseID, gr.Items[i].ItemID, netAcceptedWeight).Scan(&updatedStock)
			if err != nil {
				return fmt.Errorf("update stock balance on receiving: %w", err)
			}

			// Update inventory item master MAC cost price and true effective cost
			_, err = conn.Exec(txCtx, `
				UPDATE inventory_items
				   SET cost_price = $1,
				       effective_cost_per_unit = CASE
				           WHEN yield_conversion_ratio IS NOT NULL AND yield_conversion_ratio > 0 THEN ROUND($1::numeric / yield_conversion_ratio, 4)
				           ELSE ROUND($1::numeric / (COALESCE(NULLIF(standard_yield_percent, 0), 100.0) / 100.0), 4)
				       END,
				       current_stock = current_stock + $2,
				       updated_at = now()
				 WHERE tenant_id = $3 AND id = $4
			`, newMac, netAcceptedWeight, gr.TenantID, gr.Items[i].ItemID)
			if err != nil {
				return fmt.Errorf("update master cost price: %w", err)
			}

			// Trigger real-time Cascading HPA Recalculation across Tier-2 Sub-Recipes & Tier-3 Menus
			if r.hpaRecalc != nil {
				itemID := gr.Items[i].ItemID
				if err := r.hpaRecalc.RecalculateCascadingHPA(txCtx, gr.TenantID, &itemID, nil); err != nil {
					return fmt.Errorf("cascading hpa recalculation on receiving: %w", err)
				}
			}

			// Record stock movement ledger
			_, err = conn.Exec(txCtx, `
				INSERT INTO stock_movements (tenant_id, warehouse_id, item_id, movement_type, reference_id, quantity_change, balance_after, unit_cost)
				VALUES ($1, $2, $3, 'PURCHASE_RECEIPT', $4, $5, $6, $7)
			`, gr.TenantID, gr.WarehouseID, gr.Items[i].ItemID, gr.ReceiptNumber, netAcceptedWeight, updatedStock, gr.Items[i].UnitCost)
			if err != nil {
				return fmt.Errorf("record stock movement: %w", err)
			}

			// If this is against a PO item, update received_qty
			if gr.Items[i].POItemID != nil {
				_, _ = conn.Exec(txCtx, `UPDATE purchase_order_items SET received_qty = received_qty + $1, updated_at = now() WHERE id = $2`,
					netAcceptedWeight, *gr.Items[i].POItemID)
			}
		}

		// Update PO status to RECEIVED if PO exists
		if gr.PurchaseOrderID != nil {
			_, _ = conn.Exec(txCtx, `UPDATE purchase_orders SET status = 'RECEIVED', updated_at = now() WHERE id = $1`, *gr.PurchaseOrderID)
		}
		return nil
	})

	if err != nil {
		return nil, err
	}
	return &gr, nil
}

// -------------------------------------------------------- Stock Transfers ---

func (r *InventoryRepo) ListStockTransfers(ctx context.Context, tenantID uuid.UUID, outletID, warehouseID *uuid.UUID, status, transferType *string) ([]domain.StockTransfer, error) {
	query := `
		SELECT st.id, st.tenant_id, st.transfer_number, st.waybill_number,
		       st.origin_outlet_id, oo.code AS origin_outlet_code, oo.name AS origin_outlet_name,
		       st.origin_warehouse_id, ow.name AS origin_wh_name,
		       st.destination_outlet_id, od.code AS dest_outlet_code, od.name AS dest_outlet_name,
		       st.destination_warehouse_id, dw.name AS dest_wh_name,
		       st.transfer_date::text, st.transfer_type, st.status,
		       st.dispatched_by_name, st.dispatched_at,
		       st.received_by_name, st.received_at,
		       st.cancelled_at, st.cancellation_reason,
		       st.notes,
		       COUNT(sti.id) AS total_items,
		       COALESCE(SUM(sti.variance_qty), 0) AS total_variance_qty,
		       st.created_at, st.updated_at
		  FROM stock_transfers st
		  JOIN warehouses ow ON ow.id = st.origin_warehouse_id
		  JOIN outlets oo ON oo.id = st.origin_outlet_id
		  JOIN warehouses dw ON dw.id = st.destination_warehouse_id
		  JOIN outlets od ON od.id = st.destination_outlet_id
		  LEFT JOIN stock_transfer_items sti ON sti.transfer_id = st.id
		 WHERE st.tenant_id = $1
		   AND ($2::uuid IS NULL OR st.origin_outlet_id = $2 OR st.destination_outlet_id = $2)
		   AND ($3::uuid IS NULL OR st.origin_warehouse_id = $3 OR st.destination_warehouse_id = $3)
		   AND ($4::varchar IS NULL OR st.status = $4)
		   AND ($5::varchar IS NULL OR st.transfer_type = $5)
		 GROUP BY st.id, oo.code, oo.name, ow.name, od.code, od.name, dw.name
		 ORDER BY st.transfer_date DESC, st.created_at DESC
	`
	rows, err := r.conn(ctx).Query(ctx, query, tenantID, outletID, warehouseID, status, transferType)
	if err != nil {
		return nil, fmt.Errorf("list stock transfers: %w", err)
	}
	defer rows.Close()

	result := make([]domain.StockTransfer, 0)
	for rows.Next() {
		var st domain.StockTransfer
		var waybill, disp, recv, notes, cancelReason sql.NullString
		err := rows.Scan(
			&st.ID, &st.TenantID, &st.TransferNumber, &waybill,
			&st.OriginOutletID, &st.OriginOutletCode, &st.OriginOutletName,
			&st.OriginWarehouseID, &st.OriginWarehouseName,
			&st.DestOutletID, &st.DestOutletCode, &st.DestOutletName,
			&st.DestWarehouseID, &st.DestWarehouseName,
			&st.TransferDate, &st.TransferType, &st.Status,
			&disp, &st.DispatchedAt,
			&recv, &st.ReceivedAt,
			&st.CancelledAt, &cancelReason,
			&notes,
			&st.TotalItems, &st.TotalVarianceQty,
			&st.CreatedAt, &st.UpdatedAt,
		)
		if err != nil {
			return nil, fmt.Errorf("scan stock transfer: %w", err)
		}
		if waybill.Valid {
			st.WaybillNumber = &waybill.String
		}
		if disp.Valid {
			st.DispatchedByName = &disp.String
		}
		if recv.Valid {
			st.ReceivedByName = &recv.String
		}
		if cancelReason.Valid {
			st.CancellationReason = &cancelReason.String
		}
		if notes.Valid {
			st.Notes = &notes.String
		}
		result = append(result, st)
	}
	return result, nil
}

func (r *InventoryRepo) GetStockTransfer(ctx context.Context, tenantID, id uuid.UUID) (*domain.StockTransfer, error) {
	query := `
		SELECT st.id, st.tenant_id, st.transfer_number, st.waybill_number,
		       st.origin_outlet_id, oo.code AS origin_outlet_code, oo.name AS origin_outlet_name,
		       st.origin_warehouse_id, ow.name AS origin_wh_name,
		       st.destination_outlet_id, od.code AS dest_outlet_code, od.name AS dest_outlet_name,
		       st.destination_warehouse_id, dw.name AS dest_wh_name,
		       st.transfer_date::text, st.transfer_type, st.status,
		       st.dispatched_by_name, st.dispatched_at,
		       st.received_by_name, st.received_at,
		       st.cancelled_at, st.cancellation_reason,
		       st.notes, st.created_at, st.updated_at
		  FROM stock_transfers st
		  JOIN warehouses ow ON ow.id = st.origin_warehouse_id
		  JOIN outlets oo ON oo.id = st.origin_outlet_id
		  JOIN warehouses dw ON dw.id = st.destination_warehouse_id
		  JOIN outlets od ON od.id = st.destination_outlet_id
		 WHERE st.tenant_id = $1 AND st.id = $2
	`
	var st domain.StockTransfer
	var waybill, disp, recv, notes, cancelReason sql.NullString
	err := r.conn(ctx).QueryRow(ctx, query, tenantID, id).Scan(
		&st.ID, &st.TenantID, &st.TransferNumber, &waybill,
		&st.OriginOutletID, &st.OriginOutletCode, &st.OriginOutletName,
		&st.OriginWarehouseID, &st.OriginWarehouseName,
		&st.DestOutletID, &st.DestOutletCode, &st.DestOutletName,
		&st.DestWarehouseID, &st.DestWarehouseName,
		&st.TransferDate, &st.TransferType, &st.Status,
		&disp, &st.DispatchedAt,
		&recv, &st.ReceivedAt,
		&st.CancelledAt, &cancelReason,
		&notes, &st.CreatedAt, &st.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, domain.NotFound("mutasi stok tidak ditemukan")
		}
		return nil, fmt.Errorf("get stock transfer: %w", err)
	}
	if waybill.Valid {
		st.WaybillNumber = &waybill.String
	}
	if disp.Valid {
		st.DispatchedByName = &disp.String
	}
	if recv.Valid {
		st.ReceivedByName = &recv.String
	}
	if cancelReason.Valid {
		st.CancellationReason = &cancelReason.String
	}
	if notes.Valid {
		st.Notes = &notes.String
	}

	// Fetch items
	itemQuery := `
		SELECT sti.id, sti.transfer_id, sti.item_id, ii.code AS item_code, ii.name AS item_name,
		       sti.requested_qty, sti.dispatched_qty, sti.received_qty,
		       sti.variance_qty, sti.variance_reason, sti.unit, sti.unit_cost, sti.notes
		  FROM stock_transfer_items sti
		  JOIN inventory_items ii ON ii.id = sti.item_id
		 WHERE sti.transfer_id = $1
		 ORDER BY ii.name ASC
	`
	rows, err := r.conn(ctx).Query(ctx, itemQuery, id)
	if err != nil {
		return nil, fmt.Errorf("get stock transfer items: %w", err)
	}
	defer rows.Close()

	st.Items = make([]domain.StockTransferItem, 0)
	var totalVariance float64
	for rows.Next() {
		var it domain.StockTransferItem
		var vReason, itNotes sql.NullString
		err := rows.Scan(
			&it.ID, &it.TransferID, &it.ItemID, &it.ItemCode, &it.ItemName,
			&it.RequestedQty, &it.DispatchedQty, &it.ReceivedQty,
			&it.VarianceQty, &vReason, &it.Unit, &it.UnitCost, &itNotes,
		)
		if err != nil {
			return nil, fmt.Errorf("scan transfer item: %w", err)
		}
		if vReason.Valid {
			it.VarianceReason = &vReason.String
		}
		if itNotes.Valid {
			it.Notes = &itNotes.String
		}
		totalVariance += it.VarianceQty
		st.Items = append(st.Items, it)
	}
	st.TotalItems = len(st.Items)
	st.TotalVarianceQty = totalVariance

	return &st, nil
}

func (r *InventoryRepo) CreateStockTransfer(ctx context.Context, trf domain.StockTransfer) (*domain.StockTransfer, error) {
	err := r.txMgr.WithTx(ctx, func(txCtx context.Context) error {
		conn := r.conn(txCtx)

		// 1. Resolve origin outlet and warehouse
		err := conn.QueryRow(txCtx, `
			SELECT w.outlet_id, o.code, o.name, w.name
			  FROM warehouses w
			  JOIN outlets o ON o.id = w.outlet_id
			 WHERE w.tenant_id = $1 AND w.id = $2 AND w.deleted_at IS NULL
		`, trf.TenantID, trf.OriginWarehouseID).Scan(
			&trf.OriginOutletID, &trf.OriginOutletCode, &trf.OriginOutletName, &trf.OriginWarehouseName,
		)
		if err != nil {
			return domain.Validation("gudang asal tidak valid atau tidak terdaftar")
		}

		// 2. Resolve destination outlet and warehouse
		err = conn.QueryRow(txCtx, `
			SELECT w.outlet_id, o.code, o.name, w.name
			  FROM warehouses w
			  JOIN outlets o ON o.id = w.outlet_id
			 WHERE w.tenant_id = $1 AND w.id = $2 AND w.deleted_at IS NULL
		`, trf.TenantID, trf.DestWarehouseID).Scan(
			&trf.DestOutletID, &trf.DestOutletCode, &trf.DestOutletName, &trf.DestWarehouseName,
		)
		if err != nil {
			return domain.Validation("gudang tujuan tidak valid atau tidak terdaftar")
		}

		if trf.OriginWarehouseID == trf.DestWarehouseID {
			return domain.Validation("gudang asal dan tujuan tidak boleh sama")
		}

		if trf.OriginOutletID == trf.DestOutletID {
			trf.TransferType = domain.TransferIntraBranch
		} else {
			trf.TransferType = domain.TransferInterBranch
		}

		trf.Status = domain.TransferPending

		insertTrf := `
			INSERT INTO stock_transfers (
				tenant_id, transfer_number, waybill_number,
				origin_outlet_id, origin_warehouse_id,
				destination_outlet_id, destination_warehouse_id,
				transfer_date, transfer_type, status,
				dispatched_by_name, notes
			)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8::date, $9, $10, $11, $12)
			RETURNING id, created_at, updated_at
		`
		err = conn.QueryRow(txCtx, insertTrf,
			trf.TenantID, trf.TransferNumber, trf.WaybillNumber,
			trf.OriginOutletID, trf.OriginWarehouseID,
			trf.DestOutletID, trf.DestWarehouseID,
			trf.TransferDate, trf.TransferType, trf.Status,
			trf.DispatchedByName, trf.Notes,
		).Scan(&trf.ID, &trf.CreatedAt, &trf.UpdatedAt)
		if err != nil {
			return fmt.Errorf("insert stock transfer: %w", err)
		}

		insertItem := `
			INSERT INTO stock_transfer_items (
				tenant_id, transfer_id, item_id,
				requested_qty, dispatched_qty, received_qty,
				variance_qty, unit, unit_cost, notes
			)
			VALUES ($1, $2, $3, $4, 0, 0, 0, $5, $6, $7)
			RETURNING id
		`
		for i := range trf.Items {
			trf.Items[i].TransferID = trf.ID
			if trf.Items[i].UnitCost == 0 || trf.Items[i].Unit == "" {
				_ = conn.QueryRow(txCtx, `SELECT cost_price, unit FROM inventory_items WHERE tenant_id = $1 AND id = $2`,
					trf.TenantID, trf.Items[i].ItemID).Scan(&trf.Items[i].UnitCost, &trf.Items[i].Unit)
			}
			err = conn.QueryRow(txCtx, insertItem,
				trf.TenantID, trf.ID, trf.Items[i].ItemID,
				trf.Items[i].RequestedQty, trf.Items[i].Unit,
				trf.Items[i].UnitCost, trf.Items[i].Notes,
			).Scan(&trf.Items[i].ID)
			if err != nil {
				return fmt.Errorf("insert transfer item: %w", err)
			}
		}
		trf.TotalItems = len(trf.Items)
		return nil
	})
	if err != nil {
		return nil, err
	}
	return &trf, nil
}

func (r *InventoryRepo) DispatchStockTransfer(ctx context.Context, tenantID, id uuid.UUID, dispatchedByName string, waybillNumber *string, itemDispatches map[uuid.UUID]float64) (*domain.StockTransfer, error) {
	err := r.txMgr.WithTx(ctx, func(txCtx context.Context) error {
		conn := r.conn(txCtx)

		var origWhID uuid.UUID
		var trfNum, curStatus string
		err := conn.QueryRow(txCtx, `
			SELECT origin_warehouse_id, transfer_number, status
			  FROM stock_transfers
			 WHERE tenant_id = $1 AND id = $2
			   FOR UPDATE
		`, tenantID, id).Scan(&origWhID, &trfNum, &curStatus)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return domain.NotFound("mutasi stok tidak ditemukan")
			}
			return fmt.Errorf("lock transfer for dispatch: %w", err)
		}
		if curStatus != string(domain.TransferPending) {
			return domain.Validation("Hanya transfer berstatus PENDING yang dapat dikirim (status saat ini: %s)", curStatus)
		}

		rows, err := conn.Query(txCtx, `
			SELECT id, item_id, requested_qty, unit_cost
			  FROM stock_transfer_items
			 WHERE transfer_id = $1
		`, id)
		if err != nil {
			return fmt.Errorf("query items to dispatch: %w", err)
		}
		defer rows.Close()

		type itemToDispatch struct {
			rowID        uuid.UUID
			itemID       uuid.UUID
			requestedQty float64
			unitCost     float64
		}
		var items []itemToDispatch
		for rows.Next() {
			var it itemToDispatch
			if err := rows.Scan(&it.rowID, &it.itemID, &it.requestedQty, &it.unitCost); err != nil {
				return err
			}
			items = append(items, it)
		}
		rows.Close()

		for _, it := range items {
			dispQty := it.requestedQty
			if customQty, ok := itemDispatches[it.itemID]; ok && customQty > 0 {
				dispQty = customQty
			}

			_, err = conn.Exec(txCtx, `
				UPDATE stock_transfer_items
				   SET dispatched_qty = $1
				 WHERE id = $2
			`, dispQty, it.rowID)
			if err != nil {
				return fmt.Errorf("update item dispatched_qty: %w", err)
			}

			// Deduct from origin warehouse
			var origAfter float64
			err = conn.QueryRow(txCtx, `
				UPDATE stock_balances
				   SET quantity = GREATEST(0, quantity - $1), updated_at = now()
				 WHERE tenant_id = $2 AND warehouse_id = $3 AND item_id = $4
				RETURNING quantity
			`, dispQty, tenantID, origWhID, it.itemID).Scan(&origAfter)
			if err != nil {
				origAfter = 0
			}

			// Record stock movement TRANSFER_OUT
			_, _ = conn.Exec(txCtx, `
				INSERT INTO stock_movements (tenant_id, warehouse_id, item_id, movement_type, reference_id, quantity_change, balance_after, unit_cost)
				VALUES ($1, $2, $3, 'TRANSFER_OUT', $4, $5, $6, $7)
			`, tenantID, origWhID, it.itemID, trfNum, -dispQty, origAfter, it.unitCost)
		}

		updateQuery := `
			UPDATE stock_transfers
			   SET status = 'IN_TRANSIT',
			       dispatched_at = now(),
			       dispatched_by_name = $1,
			       waybill_number = COALESCE($2, waybill_number),
			       updated_at = now()
			 WHERE tenant_id = $3 AND id = $4
		`
		_, err = conn.Exec(txCtx, updateQuery, dispatchedByName, waybillNumber, tenantID, id)
		if err != nil {
			return fmt.Errorf("update transfer dispatch: %w", err)
		}

		return nil
	})
	if err != nil {
		return nil, err
	}
	return r.GetStockTransfer(ctx, tenantID, id)
}

type TransferReceiptItemInput struct {
	ItemID         uuid.UUID
	ReceivedQty    float64
	VarianceReason *string
	Notes          *string
}

func (r *InventoryRepo) ReceiveStockTransfer(ctx context.Context, tenantID, id uuid.UUID, receivedByName string, notes *string, receipts []TransferReceiptItemInput) (*domain.StockTransfer, error) {
	err := r.txMgr.WithTx(ctx, func(txCtx context.Context) error {
		conn := r.conn(txCtx)

		var destWhID, origWhID uuid.UUID
		var trfNum, curStatus string
		err := conn.QueryRow(txCtx, `
			SELECT destination_warehouse_id, origin_warehouse_id, transfer_number, status
			  FROM stock_transfers
			 WHERE tenant_id = $1 AND id = $2
			   FOR UPDATE
		`, tenantID, id).Scan(&destWhID, &origWhID, &trfNum, &curStatus)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return domain.NotFound("mutasi stok tidak ditemukan")
			}
			return fmt.Errorf("lock transfer for receipt: %w", err)
		}
		if curStatus != string(domain.TransferInTransit) && curStatus != string(domain.TransferPending) {
			return domain.Validation("Mutasi dengan status %s tidak dapat diterima", curStatus)
		}

		receiptMap := make(map[uuid.UUID]TransferReceiptItemInput)
		for _, rc := range receipts {
			receiptMap[rc.ItemID] = rc
		}

		rows, err := conn.Query(txCtx, `
			SELECT id, item_id, requested_qty, dispatched_qty, unit_cost
			  FROM stock_transfer_items
			 WHERE transfer_id = $1
		`, id)
		if err != nil {
			return fmt.Errorf("query items to receive: %w", err)
		}
		defer rows.Close()

		type itemRecord struct {
			rowID         uuid.UUID
			itemID        uuid.UUID
			requestedQty  float64
			dispatchedQty float64
			unitCost      float64
		}
		var items []itemRecord
		for rows.Next() {
			var it itemRecord
			if err := rows.Scan(&it.rowID, &it.itemID, &it.requestedQty, &it.dispatchedQty, &it.unitCost); err != nil {
				return err
			}
			items = append(items, it)
		}
		rows.Close()

		for _, it := range items {
			rc, found := receiptMap[it.itemID]
			dispQty := it.dispatchedQty
			if dispQty == 0 {
				dispQty = it.requestedQty
				// If transfer came straight from PENDING, deduct origin now
				var origAfter float64
				_ = conn.QueryRow(txCtx, `
					UPDATE stock_balances
					   SET quantity = GREATEST(0, quantity - $1), updated_at = now()
					 WHERE tenant_id = $2 AND warehouse_id = $3 AND item_id = $4
					RETURNING quantity
				`, dispQty, tenantID, origWhID, it.itemID).Scan(&origAfter)

				_, _ = conn.Exec(txCtx, `
					INSERT INTO stock_movements (tenant_id, warehouse_id, item_id, movement_type, reference_id, quantity_change, balance_after, unit_cost)
					VALUES ($1, $2, $3, 'TRANSFER_OUT', $4, $5, $6, $7)
				`, tenantID, origWhID, it.itemID, trfNum, -dispQty, origAfter, it.unitCost)
			}

			rcvQty := dispQty
			var reason, itNotes *string
			if found {
				rcvQty = rc.ReceivedQty
				reason = rc.VarianceReason
				itNotes = rc.Notes
			}

			varianceQty := 0.0
			if dispQty > rcvQty {
				varianceQty = dispQty - rcvQty
			}

			_, err = conn.Exec(txCtx, `
				UPDATE stock_transfer_items
				   SET dispatched_qty = $1,
				       received_qty = $2,
				       variance_qty = $3,
				       variance_reason = $4,
				       notes = COALESCE($5, notes)
				 WHERE id = $6
			`, dispQty, rcvQty, varianceQty, reason, itNotes, it.rowID)
			if err != nil {
				return fmt.Errorf("update item receipt: %w", err)
			}

			// Add received_qty to destination warehouse
			var destAfter float64
			err = conn.QueryRow(txCtx, `
				INSERT INTO stock_balances (tenant_id, warehouse_id, item_id, quantity, updated_at)
				VALUES ($1, $2, $3, $4, now())
				ON CONFLICT (tenant_id, warehouse_id, item_id)
				DO UPDATE SET quantity = stock_balances.quantity + EXCLUDED.quantity, updated_at = now()
				RETURNING quantity
			`, tenantID, destWhID, it.itemID, rcvQty).Scan(&destAfter)
			if err != nil {
				return fmt.Errorf("upsert destination stock balance: %w", err)
			}

			// Record stock movement TRANSFER_IN
			_, _ = conn.Exec(txCtx, `
				INSERT INTO stock_movements (tenant_id, warehouse_id, item_id, movement_type, reference_id, quantity_change, balance_after, unit_cost)
				VALUES ($1, $2, $3, 'TRANSFER_IN', $4, $5, $6, $7)
			`, tenantID, destWhID, it.itemID, trfNum, rcvQty, destAfter, it.unitCost)
		}

		// Update transfer header
		_, err = conn.Exec(txCtx, `
			UPDATE stock_transfers
			   SET status = 'RECEIVED',
			       received_at = now(),
			       received_by_name = $1,
			       notes = COALESCE($2, notes),
			       updated_at = now()
			 WHERE tenant_id = $3 AND id = $4
		`, receivedByName, notes, tenantID, id)
		if err != nil {
			return fmt.Errorf("update transfer received: %w", err)
		}

		return nil
	})
	if err != nil {
		return nil, err
	}
	return r.GetStockTransfer(ctx, tenantID, id)
}

func (r *InventoryRepo) CancelStockTransfer(ctx context.Context, tenantID, id uuid.UUID, cancellationReason string) (*domain.StockTransfer, error) {
	err := r.txMgr.WithTx(ctx, func(txCtx context.Context) error {
		conn := r.conn(txCtx)

		var origWhID uuid.UUID
		var trfNum, curStatus string
		err := conn.QueryRow(txCtx, `
			SELECT origin_warehouse_id, transfer_number, status
			  FROM stock_transfers
			 WHERE tenant_id = $1 AND id = $2
			   FOR UPDATE
		`, tenantID, id).Scan(&origWhID, &trfNum, &curStatus)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return domain.NotFound("mutasi stok tidak ditemukan")
			}
			return fmt.Errorf("lock transfer for cancel: %w", err)
		}

		if curStatus == string(domain.TransferReceived) {
			return domain.Validation("Mutasi yang sudah RECEIVED (diterima) tidak dapat dibatalkan")
		}
		if curStatus == string(domain.TransferCancelled) {
			return domain.Validation("Mutasi ini sudah dibatalkan sebelumnya")
		}

		// If was IN_TRANSIT, origin warehouse was deducted, so roll back deducted items
		if curStatus == string(domain.TransferInTransit) {
			rows, err := conn.Query(txCtx, `
				SELECT item_id, dispatched_qty, unit_cost
				  FROM stock_transfer_items
				 WHERE transfer_id = $1 AND dispatched_qty > 0
			`, id)
			if err != nil {
				return fmt.Errorf("query items to roll back: %w", err)
			}
			defer rows.Close()

			type itemRollback struct {
				itemID   uuid.UUID
				qty      float64
				unitCost float64
			}
			var rollbacks []itemRollback
			for rows.Next() {
				var rb itemRollback
				if err := rows.Scan(&rb.itemID, &rb.qty, &rb.unitCost); err != nil {
					return err
				}
				rollbacks = append(rollbacks, rb)
			}
			rows.Close()

			for _, rb := range rollbacks {
				var origAfter float64
				err = conn.QueryRow(txCtx, `
					UPDATE stock_balances
					   SET quantity = quantity + $1, updated_at = now()
					 WHERE tenant_id = $2 AND warehouse_id = $3 AND item_id = $4
					RETURNING quantity
				`, rb.qty, tenantID, origWhID, rb.itemID).Scan(&origAfter)
				if err != nil {
					continue
				}

				_, _ = conn.Exec(txCtx, `
					INSERT INTO stock_movements (tenant_id, warehouse_id, item_id, movement_type, reference_id, quantity_change, balance_after, unit_cost)
					VALUES ($1, $2, $3, 'TRANSFER_CANCEL_RETURN', $4, $5, $6, $7)
				`, tenantID, origWhID, rb.itemID, trfNum, rb.qty, origAfter, rb.unitCost)
			}
		}

		// Update transfer status to CANCELLED
		_, err = conn.Exec(txCtx, `
			UPDATE stock_transfers
			   SET status = 'CANCELLED',
			       cancelled_at = now(),
			       cancellation_reason = $1,
			       updated_at = now()
			 WHERE tenant_id = $2 AND id = $3
		`, cancellationReason, tenantID, id)
		if err != nil {
			return fmt.Errorf("cancel stock transfer: %w", err)
		}

		return nil
	})
	if err != nil {
		return nil, err
	}
	return r.GetStockTransfer(ctx, tenantID, id)
}

// --------------------------------------------------------- Stock Opnames ----

func (r *InventoryRepo) ListStockOpnames(ctx context.Context, tenantID uuid.UUID, warehouseID *uuid.UUID) ([]domain.StockOpname, error) {
	query := `
		SELECT so.id, so.tenant_id, so.opname_number, so.warehouse_id, w.name AS wh_name,
		       so.opname_date::text, so.status, so.conducted_by_name, so.approved_by_name,
		       so.notes, COALESCE(SUM(soi.variance_cost), 0) AS total_variance_cost,
		       so.created_at, so.updated_at
		  FROM stock_opnames so
		  JOIN warehouses w ON w.id = so.warehouse_id
		  LEFT JOIN stock_opname_items soi ON soi.stock_opname_id = so.id
		 WHERE so.tenant_id = $1
		   AND ($2::uuid IS NULL OR so.warehouse_id = $2)
		 GROUP BY so.id, w.name
		 ORDER BY so.opname_date DESC, so.created_at DESC
	`
	rows, err := r.conn(ctx).Query(ctx, query, tenantID, warehouseID)
	if err != nil {
		return nil, fmt.Errorf("list stock opnames: %w", err)
	}
	defer rows.Close()

	result := make([]domain.StockOpname, 0)
	for rows.Next() {
		var so domain.StockOpname
		var cond, appv, notes sql.NullString
		err := rows.Scan(
			&so.ID, &so.TenantID, &so.OpnameNumber, &so.WarehouseID, &so.WarehouseName,
			&so.OpnameDate, &so.Status, &cond, &appv, &notes, &so.TotalVarianceCost,
			&so.CreatedAt, &so.UpdatedAt,
		)
		if err != nil {
			return nil, fmt.Errorf("scan stock opname: %w", err)
		}
		if cond.Valid {
			so.ConductedByName = &cond.String
		}
		if appv.Valid {
			so.ApprovedByName = &appv.String
		}
		if notes.Valid {
			so.Notes = &notes.String
		}
		result = append(result, so)
	}
	return result, nil
}

func (r *InventoryRepo) GetStockOpname(ctx context.Context, tenantID, id uuid.UUID, isBlindStaff bool) (*domain.StockOpname, error) {
	query := `
		SELECT so.id, so.tenant_id, so.opname_number, so.warehouse_id, w.name AS wh_name,
		       so.opname_date::text, so.status, so.conducted_by_name, so.approved_by_name,
		       so.notes, so.created_at, so.updated_at
		  FROM stock_opnames so
		  JOIN warehouses w ON w.id = so.warehouse_id
		 WHERE so.tenant_id = $1 AND so.id = $2
	`
	var so domain.StockOpname
	var cond, appv, notes sql.NullString
	err := r.conn(ctx).QueryRow(ctx, query, tenantID, id).Scan(
		&so.ID, &so.TenantID, &so.OpnameNumber, &so.WarehouseID, &so.WarehouseName,
		&so.OpnameDate, &so.Status, &cond, &appv, &notes, &so.CreatedAt, &so.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, domain.NotFound("Stock Opname session tidak ditemukan")
		}
		return nil, fmt.Errorf("get stock opname: %w", err)
	}
	if cond.Valid {
		so.ConductedByName = &cond.String
	}
	if appv.Valid {
		so.ApprovedByName = &appv.String
	}
	if notes.Valid {
		so.Notes = &notes.String
	}

	// Fetch items
	itemsQuery := `
		SELECT soi.id, soi.stock_opname_id, soi.item_id, ii.code, ii.name, ii.unit,
		       soi.system_theoretical_qty, soi.physical_counted_qty, soi.variance_qty,
		       soi.unit_cost, soi.variance_cost, soi.variance_category, soi.notes
		  FROM stock_opname_items soi
		  JOIN inventory_items ii ON ii.id = soi.item_id
		 WHERE soi.stock_opname_id = $1
		 ORDER BY ii.name ASC
	`
	rows, err := r.conn(ctx).Query(ctx, itemsQuery, so.ID)
	if err != nil {
		return nil, fmt.Errorf("get opname items: %w", err)
	}
	defer rows.Close()

	so.Items = make([]domain.StockOpnameItem, 0)
	for rows.Next() {
		var it domain.StockOpnameItem
		var notes sql.NullString
		var theoQty, varQty, varCost float64
		err := rows.Scan(
			&it.ID, &it.StockOpnameID, &it.ItemID, &it.ItemCode, &it.ItemName, &it.Unit,
			&theoQty, &it.PhysicalCountedQty, &varQty, &it.UnitCost, &varCost,
			&it.VarianceCategory, &notes,
		)
		if err != nil {
			return nil, fmt.Errorf("scan opname item: %w", err)
		}
		if notes.Valid {
			it.Notes = &notes.String
		}

		// BLIND COUNTING LOGIC: If caller is floor staff entering counts, hide theoretical stock!
		if !isBlindStaff {
			it.SystemTheoreticalQty = &theoQty
			it.VarianceQty = &varQty
			it.VarianceCost = &varCost
			so.TotalVarianceCost += varCost
		}

		so.Items = append(so.Items, it)
	}
	return &so, nil
}

func (r *InventoryRepo) CreateStockOpname(ctx context.Context, so domain.StockOpname) (*domain.StockOpname, error) {
	err := r.txMgr.WithTx(ctx, func(txCtx context.Context) error {
		conn := r.conn(txCtx)

		insertSo := `
			INSERT INTO stock_opnames (tenant_id, opname_number, warehouse_id, opname_date, status, conducted_by_name, notes)
			VALUES ($1, $2, $3, $4::date, $5, $6, $7)
			RETURNING id, created_at, updated_at
		`
		err := conn.QueryRow(txCtx, insertSo,
			so.TenantID, so.OpnameNumber, so.WarehouseID, so.OpnameDate,
			so.Status, so.ConductedByName, so.Notes,
		).Scan(&so.ID, &so.CreatedAt, &so.UpdatedAt)
		if err != nil {
			return fmt.Errorf("insert stock opname: %w", err)
		}

		// Auto-populate all active inventory items in this warehouse with their theoretical stock
		populateItems := `
			INSERT INTO stock_opname_items (tenant_id, stock_opname_id, item_id, system_theoretical_qty,
			                                physical_counted_qty, variance_qty, unit_cost, variance_cost)
			SELECT $1, $2, ii.id, COALESCE(sb.quantity, 0), 0, -COALESCE(sb.quantity, 0),
			       ii.cost_price, (-COALESCE(sb.quantity, 0) * ii.cost_price)
			  FROM inventory_items ii
			  LEFT JOIN stock_balances sb ON sb.warehouse_id = $3 AND sb.item_id = ii.id
			 WHERE ii.tenant_id = $1 AND ii.is_active = true
		`
		_, err = conn.Exec(txCtx, populateItems, so.TenantID, so.ID, so.WarehouseID)
		if err != nil {
			return fmt.Errorf("populate opname items: %w", err)
		}
		return nil
	})

	if err != nil {
		return nil, err
	}
	return &so, nil
}

func (r *InventoryRepo) SaveOpnameCount(ctx context.Context, tenantID, opnameID uuid.UUID, items []domain.StockOpnameItem) error {
	return r.txMgr.WithTx(ctx, func(txCtx context.Context) error {
		conn := r.conn(txCtx)

		for _, it := range items {
			var theoQty, unitCost float64
			err := conn.QueryRow(txCtx, `SELECT system_theoretical_qty, unit_cost FROM stock_opname_items WHERE tenant_id = $1 AND stock_opname_id = $2 AND item_id = $3`,
				tenantID, opnameID, it.ItemID).Scan(&theoQty, &unitCost)
			if err != nil {
				continue
			}

			varQty, varCost := engine.CalculateOpnameVariance(theoQty, it.PhysicalCountedQty, unitCost)
			_, err = conn.Exec(txCtx, `
				UPDATE stock_opname_items
				   SET physical_counted_qty = $1, variance_qty = $2, variance_cost = $3,
				       variance_category = $4, notes = $5
				 WHERE tenant_id = $6 AND stock_opname_id = $7 AND item_id = $8
			`, it.PhysicalCountedQty, varQty, varCost, it.VarianceCategory, it.Notes, tenantID, opnameID, it.ItemID)
			if err != nil {
				return fmt.Errorf("update opname count: %w", err)
			}
		}

		_, err := conn.Exec(txCtx, `UPDATE stock_opnames SET status = 'COUNTED', updated_at = now() WHERE tenant_id = $1 AND id = $2`, tenantID, opnameID)
		return err
	})
}

func (r *InventoryRepo) ApproveStockOpname(ctx context.Context, tenantID, opnameID uuid.UUID, approvedByName string) error {
	return r.txMgr.WithTx(ctx, func(txCtx context.Context) error {
		conn := r.conn(txCtx)

		var whID uuid.UUID
		var opNum string
		err := conn.QueryRow(txCtx, `SELECT warehouse_id, opname_number FROM stock_opnames WHERE tenant_id = $1 AND id = $2`, tenantID, opnameID).Scan(&whID, &opNum)
		if err != nil {
			return fmt.Errorf("get opname: %w", err)
		}

		rows, err := conn.Query(txCtx, `SELECT item_id, physical_counted_qty, variance_qty, unit_cost FROM stock_opname_items WHERE stock_opname_id = $1`, opnameID)
		if err != nil {
			return err
		}
		defer rows.Close()

		type opItem struct {
			itemID   uuid.UUID
			physQty  float64
			varQty   float64
			unitCost float64
		}
		var list []opItem
		for rows.Next() {
			var oi opItem
			if err := rows.Scan(&oi.itemID, &oi.physQty, &oi.varQty, &oi.unitCost); err != nil {
				return err
			}
			list = append(list, oi)
		}
		rows.Close()

		for _, it := range list {
			// Set warehouse balance directly to physical counted quantity
			_, err = conn.Exec(txCtx, `
				INSERT INTO stock_balances (tenant_id, warehouse_id, item_id, quantity, last_counted_at, updated_at)
				VALUES ($1, $2, $3, $4, now(), now())
				ON CONFLICT (tenant_id, warehouse_id, item_id)
				DO UPDATE SET quantity = EXCLUDED.quantity, last_counted_at = now(), updated_at = now()
			`, tenantID, whID, it.itemID, it.physQty)
			if err != nil {
				return fmt.Errorf("update balance on opname approval: %w", err)
			}

			// Log movement
			if it.varQty != 0 {
				_, _ = conn.Exec(txCtx, `
					INSERT INTO stock_movements (tenant_id, warehouse_id, item_id, movement_type, reference_id, quantity_change, balance_after, unit_cost)
					VALUES ($1, $2, $3, 'OPNAME_ADJUSTMENT', $4, $5, $6, $7)
				`, tenantID, whID, it.itemID, opNum, it.varQty, it.physQty, it.unitCost)
			}
		}

		_, err = conn.Exec(txCtx, `UPDATE stock_opnames SET status = 'APPROVED', approved_by_name = $1, updated_at = now() WHERE tenant_id = $2 AND id = $3`,
			approvedByName, tenantID, opnameID)
		return err
	})
}

// --------------------------------------------------------- Waste Records ----

func (r *InventoryRepo) ListWasteRecords(ctx context.Context, tenantID uuid.UUID, warehouseID *uuid.UUID) ([]domain.WasteRecord, error) {
	query := `
		SELECT wr.id, wr.tenant_id, wr.outlet_id, o.name AS outlet_name,
		       wr.warehouse_id, w.name AS wh_name, wr.waste_number, wr.waste_date::text,
		       wr.category, wr.recipient_division, wr.total_cost, wr.photo_url, wr.recorded_by_name, wr.notes,
		       wr.created_at, wr.updated_at
		  FROM waste_records wr
		  JOIN outlets o ON o.id = wr.outlet_id
		  JOIN warehouses w ON w.id = wr.warehouse_id
		 WHERE wr.tenant_id = $1
		   AND ($2::uuid IS NULL OR wr.warehouse_id = $2)
		 ORDER BY wr.waste_date DESC, wr.created_at DESC
	`
	rows, err := r.conn(ctx).Query(ctx, query, tenantID, warehouseID)
	if err != nil {
		return nil, fmt.Errorf("list waste records: %w", err)
	}
	defer rows.Close()

	result := make([]domain.WasteRecord, 0)
	for rows.Next() {
		var wr domain.WasteRecord
		var recipientDiv, photo, recBy, notes sql.NullString
		err := rows.Scan(
			&wr.ID, &wr.TenantID, &wr.OutletID, &wr.OutletName,
			&wr.WarehouseID, &wr.WarehouseName, &wr.WasteNumber, &wr.WasteDate,
			&wr.Category, &recipientDiv, &wr.TotalCost, &photo, &recBy, &notes,
			&wr.CreatedAt, &wr.UpdatedAt,
		)
		if err != nil {
			return nil, fmt.Errorf("scan waste record: %w", err)
		}
		if recipientDiv.Valid {
			wr.RecipientDivision = &recipientDiv.String
		}
		if photo.Valid {
			wr.PhotoURL = &photo.String
		}
		if recBy.Valid {
			wr.RecordedByName = &recBy.String
		}
		if notes.Valid {
			wr.Notes = &notes.String
		}
		result = append(result, wr)
	}
	return result, nil
}

func (r *InventoryRepo) CreateWasteRecord(ctx context.Context, wr domain.WasteRecord) (*domain.WasteRecord, error) {
	err := r.txMgr.WithTx(ctx, func(txCtx context.Context) error {
		conn := r.conn(txCtx)

		insertWr := `
			INSERT INTO waste_records (tenant_id, outlet_id, warehouse_id, waste_number, waste_date,
			                           category, recipient_division, total_cost, photo_url, recorded_by_name, notes)
			VALUES ($1, $2, $3, $4, $5::date, $6, $7, $8, $9, $10, $11)
			RETURNING id, created_at, updated_at
		`
		err := conn.QueryRow(txCtx, insertWr,
			wr.TenantID, wr.OutletID, wr.WarehouseID, wr.WasteNumber, wr.WasteDate,
			wr.Category, wr.RecipientDivision, wr.TotalCost, wr.PhotoURL, wr.RecordedByName, wr.Notes,
		).Scan(&wr.ID, &wr.CreatedAt, &wr.UpdatedAt)
		if err != nil {
			return fmt.Errorf("insert waste record: %w", err)
		}

		for i := range wr.Items {
			wr.Items[i].WasteID = wr.ID
			_, err = conn.Exec(txCtx, `
				INSERT INTO waste_record_items (tenant_id, waste_record_id, item_id, quantity, unit, unit_cost, subtotal_cost, notes)
				VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
			`, wr.TenantID, wr.ID, wr.Items[i].ItemID, wr.Items[i].Quantity, wr.Items[i].Unit, wr.Items[i].UnitCost, wr.Items[i].SubtotalCost, wr.Items[i].Notes)
			if err != nil {
				return fmt.Errorf("insert waste item: %w", err)
			}

			// Deduct stock balance in warehouse
			var balanceAfter float64
			err = conn.QueryRow(txCtx, `
				UPDATE stock_balances SET quantity = GREATEST(0, quantity - $1), updated_at = now()
				 WHERE tenant_id = $2 AND warehouse_id = $3 AND item_id = $4
				RETURNING quantity
			`, wr.Items[i].Quantity, wr.TenantID, wr.WarehouseID, wr.Items[i].ItemID).Scan(&balanceAfter)
			if err == nil {
				_, _ = conn.Exec(txCtx, `
					UPDATE inventory_items SET current_stock = GREATEST(0, current_stock - $1), updated_at = now()
					WHERE tenant_id = $2 AND id = $3
				`, wr.Items[i].Quantity, wr.TenantID, wr.Items[i].ItemID)

				_, _ = conn.Exec(txCtx, `
					INSERT INTO stock_movements (tenant_id, warehouse_id, item_id, movement_type, reference_id, quantity_change, balance_after, unit_cost)
					VALUES ($1, $2, $3, 'WASTE_DISPOSAL', $4, $5, $6, $7)
				`, wr.TenantID, wr.WarehouseID, wr.Items[i].ItemID, wr.WasteNumber, -wr.Items[i].Quantity, balanceAfter, wr.Items[i].UnitCost)
			}
		}
		return nil
	})

	if err != nil {
		return nil, err
	}
	return &wr, nil
}

// ------------------------------------------------------------- Menu HPA -----

func (r *InventoryRepo) ListMenuHpa(ctx context.Context, tenantID uuid.UUID, outletID *uuid.UUID) ([]domain.MenuHpaItem, error) {
	query := `
		SELECT m.id, m.outlet_id, o.name AS outlet_name, mc.name AS cat_name,
		       m.code, m.name, m.selling_price, m.target_food_cost_pct,
		       m.hpa_calculation_mode, m.manual_hpa,
		       COALESCE(r.cost_per_portion, m.last_calculated_hpa) AS dynamic_bom_hpa
		  FROM menu_items m
		  LEFT JOIN outlets o ON o.id = m.outlet_id
		  JOIN menu_categories mc ON mc.id = m.category_id
		  LEFT JOIN recipes r ON r.menu_item_id = m.id AND r.deleted_at IS NULL
		 WHERE m.tenant_id = $1 AND m.deleted_at IS NULL
		   AND ($2::uuid IS NULL OR m.outlet_id = $2 OR m.outlet_id IS NULL)
		 ORDER BY mc.display_order ASC, m.name ASC
	`
	rows, err := r.conn(ctx).Query(ctx, query, tenantID, outletID)
	if err != nil {
		return nil, fmt.Errorf("list menu hpa: %w", err)
	}
	defer rows.Close()

	result := make([]domain.MenuHpaItem, 0)
	for rows.Next() {
		var it domain.MenuHpaItem
		var outletName sql.NullString
		err := rows.Scan(
			&it.ID, &it.OutletID, &outletName, &it.CategoryName,
			&it.Code, &it.Name, &it.SellingPrice, &it.TargetFoodCostPct,
			&it.HpaCalculationMode, &it.ManualHpa, &it.DynamicBomHpa,
		)
		if err != nil {
			return nil, fmt.Errorf("scan menu hpa: %w", err)
		}
		if outletName.Valid {
			it.OutletName = &outletName.String
		}

		// Calculate margins and variance using engine
		eff, margin, fcPct, varAmt, varPct, isAlert := engine.EvaluateMenuHpa(
			it.SellingPrice, it.DynamicBomHpa, it.ManualHpa, it.HpaCalculationMode,
		)
		it.EffectiveHpa = eff
		it.GrossMargin = margin
		it.FoodCostPct = fcPct
		it.VarianceAmount = varAmt
		it.VariancePct = varPct
		it.IsVarianceAlert = isAlert

		result = append(result, it)
	}
	return result, nil
}

func (r *InventoryRepo) UpdateMenuHpaMode(ctx context.Context, tenantID, menuItemId uuid.UUID, mode string, manualHpa float64) error {
	query := `
		UPDATE menu_items
		   SET hpa_calculation_mode = $1, manual_hpa = $2, updated_at = now()
		 WHERE tenant_id = $3 AND id = $4
	`
	_, err := r.conn(ctx).Exec(ctx, query, mode, manualHpa, tenantID, menuItemId)
	return err
}
