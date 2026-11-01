package repository

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"tropical-fnb/backend/internal/modules/crm/domain"
	"tropical-fnb/backend/internal/platform/database"
)

type CRMRepository struct {
	txMgr *database.TxManager
}

func NewCRMRepository(txMgr *database.TxManager) *CRMRepository {
	return &CRMRepository{txMgr: txMgr}
}

// ListCustomers returns customers with optional text search and tier filtering.
func (r *CRMRepository) ListCustomers(ctx context.Context, tenantID uuid.UUID, search string, tier *string) ([]domain.Customer, error) {
	query := `
		SELECT 
			id, tenant_id, phone, name, email, membership_tier, points_balance,
			lifetime_spend, visit_count, TO_CHAR(birthday, 'YYYY-MM-DD'),
			dietary_notes, preferences, created_at, updated_at
		FROM customers
		WHERE tenant_id = $1
		  AND ($2 = '' OR name ILIKE '%' || $2 || '%' OR phone ILIKE '%' || $2 || '%')
		  AND ($3::TEXT IS NULL OR membership_tier = $3)
		ORDER BY lifetime_spend DESC, visit_count DESC, created_at DESC
	`

	rows, err := r.txMgr.Conn(ctx).Query(ctx, query, tenantID, strings.TrimSpace(search), tier)
	if err != nil {
		return nil, fmt.Errorf("list customers: %w", err)
	}
	defer rows.Close()

	customers := make([]domain.Customer, 0)
	for rows.Next() {
		var c domain.Customer
		if err := rows.Scan(
			&c.ID, &c.TenantID, &c.Phone, &c.Name, &c.Email, &c.MembershipTier, &c.PointsBalance,
			&c.LifetimeSpend, &c.VisitCount, &c.Birthday,
			&c.DietaryNotes, &c.Preferences, &c.CreatedAt, &c.UpdatedAt,
		); err != nil {
			return nil, fmt.Errorf("scan customer: %w", err)
		}
		customers = append(customers, c)
	}
	return customers, nil
}

// GetCustomerByID returns customer profile by ID.
func (r *CRMRepository) GetCustomerByID(ctx context.Context, tenantID, customerID uuid.UUID) (*domain.Customer, error) {
	query := `
		SELECT 
			id, tenant_id, phone, name, email, membership_tier, points_balance,
			lifetime_spend, visit_count, TO_CHAR(birthday, 'YYYY-MM-DD'),
			dietary_notes, preferences, created_at, updated_at
		FROM customers
		WHERE tenant_id = $1 AND id = $2
	`

	var c domain.Customer
	err := r.txMgr.Conn(ctx).QueryRow(ctx, query, tenantID, customerID).Scan(
		&c.ID, &c.TenantID, &c.Phone, &c.Name, &c.Email, &c.MembershipTier, &c.PointsBalance,
		&c.LifetimeSpend, &c.VisitCount, &c.Birthday,
		&c.DietaryNotes, &c.Preferences, &c.CreatedAt, &c.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, domain.NewNotFoundError("CUSTOMER_NOT_FOUND", "Pelanggan tidak ditemukan")
		}
		return nil, fmt.Errorf("get customer by id: %w", err)
	}
	return &c, nil
}

// GetCustomerByPhone searches for a customer by unique phone number within the tenant.
func (r *CRMRepository) GetCustomerByPhone(ctx context.Context, tenantID uuid.UUID, phone string) (*domain.Customer, error) {
	query := `
		SELECT 
			id, tenant_id, phone, name, email, membership_tier, points_balance,
			lifetime_spend, visit_count, TO_CHAR(birthday, 'YYYY-MM-DD'),
			dietary_notes, preferences, created_at, updated_at
		FROM customers
		WHERE tenant_id = $1 AND phone = $2
	`

	var c domain.Customer
	err := r.txMgr.Conn(ctx).QueryRow(ctx, query, tenantID, phone).Scan(
		&c.ID, &c.TenantID, &c.Phone, &c.Name, &c.Email, &c.MembershipTier, &c.PointsBalance,
		&c.LifetimeSpend, &c.VisitCount, &c.Birthday,
		&c.DietaryNotes, &c.Preferences, &c.CreatedAt, &c.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil // Return nil when not found so callers can handle gracefully
		}
		return nil, fmt.Errorf("get customer by phone: %w", err)
	}
	return &c, nil
}

// CreateCustomer inserts a new customer into the database.
func (r *CRMRepository) CreateCustomer(ctx context.Context, tenantID uuid.UUID, req domain.CreateCustomerRequest) (*domain.Customer, error) {
	query := `
		INSERT INTO customers (
			tenant_id, phone, name, email, membership_tier, points_balance,
			lifetime_spend, visit_count, birthday, dietary_notes, preferences
		) VALUES (
			$1, $2, $3, $4, 'BRONZE', 0,
			0.00, 0, $5::DATE, $6, $7
		) RETURNING 
			id, tenant_id, phone, name, email, membership_tier, points_balance,
			lifetime_spend, visit_count, TO_CHAR(birthday, 'YYYY-MM-DD'),
			dietary_notes, preferences, created_at, updated_at
	`

	var c domain.Customer
	err := r.txMgr.Conn(ctx).QueryRow(ctx, query,
		tenantID, req.Phone, req.Name, req.Email, req.Birthday, req.DietaryNotes, req.Preferences,
	).Scan(
		&c.ID, &c.TenantID, &c.Phone, &c.Name, &c.Email, &c.MembershipTier, &c.PointsBalance,
		&c.LifetimeSpend, &c.VisitCount, &c.Birthday,
		&c.DietaryNotes, &c.Preferences, &c.CreatedAt, &c.UpdatedAt,
	)
	if err != nil {
		if strings.Contains(err.Error(), "uq_customers_phone") {
			return nil, domain.NewConflictError("PHONE_ALREADY_EXISTS", "Nomor telepon pelanggan sudah terdaftar")
		}
		return nil, fmt.Errorf("create customer: %w", err)
	}
	return &c, nil
}

// UpdateCustomer updates customer information and notes.
func (r *CRMRepository) UpdateCustomer(ctx context.Context, tenantID, customerID uuid.UUID, req domain.UpdateCustomerRequest) (*domain.Customer, error) {
	query := `
		UPDATE customers
		SET name = COALESCE(NULLIF($1, ''), name),
		    email = $2,
		    birthday = $3::DATE,
		    dietary_notes = $4,
		    preferences = $5,
		    membership_tier = COALESCE($6, membership_tier),
		    updated_at = now()
		WHERE tenant_id = $7 AND id = $8
		RETURNING 
			id, tenant_id, phone, name, email, membership_tier, points_balance,
			lifetime_spend, visit_count, TO_CHAR(birthday, 'YYYY-MM-DD'),
			dietary_notes, preferences, created_at, updated_at
	`

	var c domain.Customer
	err := r.txMgr.Conn(ctx).QueryRow(ctx, query,
		req.Name, req.Email, req.Birthday, req.DietaryNotes, req.Preferences, req.MembershipTier, tenantID, customerID,
	).Scan(
		&c.ID, &c.TenantID, &c.Phone, &c.Name, &c.Email, &c.MembershipTier, &c.PointsBalance,
		&c.LifetimeSpend, &c.VisitCount, &c.Birthday,
		&c.DietaryNotes, &c.Preferences, &c.CreatedAt, &c.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, domain.NewNotFoundError("CUSTOMER_NOT_FOUND", "Pelanggan tidak ditemukan")
		}
		return nil, fmt.Errorf("update customer: %w", err)
	}
	return &c, nil
}

// AdjustPoints applies a points transaction (earn, redeem, adjustment) atomically.
func (r *CRMRepository) AdjustPoints(ctx context.Context, tenantID, customerID uuid.UUID, txType string, points int, description string, orderID *uuid.UUID) (*domain.PointsLedgerEntry, error) {
	var entry domain.PointsLedgerEntry

	err := r.txMgr.WithTx(ctx, func(txCtx context.Context) error {
		// 1. Lock customer row for update
		var currentBalance int
		var custName, custPhone string
		err := r.txMgr.Conn(txCtx).QueryRow(txCtx, `
			SELECT points_balance, name, phone 
			FROM customers 
			WHERE tenant_id = $1 AND id = $2 
			FOR UPDATE
		`, tenantID, customerID).Scan(&currentBalance, &custName, &custPhone)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return domain.NewNotFoundError("CUSTOMER_NOT_FOUND", "Pelanggan tidak ditemukan")
			}
			return fmt.Errorf("lock customer for points adjustment: %w", err)
		}

		newBalance := currentBalance + points
		if newBalance < 0 {
			return domain.NewValidationError("INSUFFICIENT_POINTS", fmt.Sprintf("Saldo poin tidak mencukupi (tersedia: %d, dibutuhkan: %d)", currentBalance, -points))
		}

		// 2. Update customer balance
		if _, err := r.txMgr.Conn(txCtx).Exec(txCtx, `
			UPDATE customers 
			SET points_balance = $1, updated_at = now() 
			WHERE id = $2
		`, newBalance, customerID); err != nil {
			return fmt.Errorf("update customer points balance: %w", err)
		}

		// 3. Insert into ledger
		insertLedger := `
			INSERT INTO customer_points_ledger (
				tenant_id, customer_id, order_id, tx_type, points, balance_after, description
			) VALUES (
				$1, $2, $3, $4, $5, $6, $7
			) RETURNING id, created_at
		`
		err = r.txMgr.Conn(txCtx).QueryRow(txCtx, insertLedger,
			tenantID, customerID, orderID, txType, points, newBalance, description,
		).Scan(&entry.ID, &entry.CreatedAt)
		if err != nil {
			return fmt.Errorf("insert points ledger: %w", err)
		}

		entry.TenantID = tenantID
		entry.CustomerID = customerID
		entry.CustomerName = custName
		entry.CustomerPhone = custPhone
		entry.OrderID = orderID
		entry.TxType = txType
		entry.Points = points
		entry.BalanceAfter = newBalance
		entry.Description = description

		return nil
	})

	if err != nil {
		return nil, err
	}
	return &entry, nil
}

// ListPointsLedger returns historical points transactions.
func (r *CRMRepository) ListPointsLedger(ctx context.Context, tenantID uuid.UUID, customerID *uuid.UUID, limit int) ([]domain.PointsLedgerEntry, error) {
	if limit <= 0 || limit > 100 {
		limit = 50
	}

	query := `
		SELECT 
			l.id, l.tenant_id, l.customer_id, c.name AS customer_name, c.phone AS customer_phone,
			l.order_id, l.tx_type, l.points, l.balance_after, l.description, l.created_at
		FROM customer_points_ledger l
		JOIN customers c ON c.id = l.customer_id
		WHERE l.tenant_id = $1
		  AND ($2::UUID IS NULL OR l.customer_id = $2)
		ORDER BY l.created_at DESC
		LIMIT $3
	`

	rows, err := r.txMgr.Conn(ctx).Query(ctx, query, tenantID, customerID, limit)
	if err != nil {
		return nil, fmt.Errorf("list points ledger: %w", err)
	}
	defer rows.Close()

	entries := make([]domain.PointsLedgerEntry, 0)
	for rows.Next() {
		var e domain.PointsLedgerEntry
		if err := rows.Scan(
			&e.ID, &e.TenantID, &e.CustomerID, &e.CustomerName, &e.CustomerPhone,
			&e.OrderID, &e.TxType, &e.Points, &e.BalanceAfter, &e.Description, &e.CreatedAt,
		); err != nil {
			return nil, fmt.Errorf("scan points ledger entry: %w", err)
		}
		entries = append(entries, e)
	}
	return entries, nil
}

// ListVouchers returns all vouchers for the tenant.
func (r *CRMRepository) ListVouchers(ctx context.Context, tenantID uuid.UUID) ([]domain.Voucher, error) {
	query := `
		SELECT 
			id, tenant_id, code, title, description, discount_type, discount_value,
			max_discount_amount, min_purchase_amount, min_membership_tier,
			usage_limit_total, usage_count,
			TO_CHAR(valid_from, 'YYYY-MM-DD'), TO_CHAR(valid_until, 'YYYY-MM-DD'),
			is_active, created_at, updated_at
		FROM vouchers
		WHERE tenant_id = $1
		ORDER BY is_active DESC, valid_until DESC, created_at DESC
	`

	rows, err := r.txMgr.Conn(ctx).Query(ctx, query, tenantID)
	if err != nil {
		return nil, fmt.Errorf("list vouchers: %w", err)
	}
	defer rows.Close()

	vouchers := make([]domain.Voucher, 0)
	for rows.Next() {
		var v domain.Voucher
		if err := rows.Scan(
			&v.ID, &v.TenantID, &v.Code, &v.Title, &v.Description, &v.DiscountType, &v.DiscountValue,
			&v.MaxDiscountAmount, &v.MinPurchaseAmount, &v.MinMembershipTier,
			&v.UsageLimitTotal, &v.UsageCount,
			&v.ValidFrom, &v.ValidUntil,
			&v.IsActive, &v.CreatedAt, &v.UpdatedAt,
		); err != nil {
			return nil, fmt.Errorf("scan voucher: %w", err)
		}
		vouchers = append(vouchers, v)
	}
	return vouchers, nil
}

// GetVoucherByCode fetches an active voucher by case-insensitive code.
func (r *CRMRepository) GetVoucherByCode(ctx context.Context, tenantID uuid.UUID, code string) (*domain.Voucher, error) {
	query := `
		SELECT 
			id, tenant_id, code, title, description, discount_type, discount_value,
			max_discount_amount, min_purchase_amount, min_membership_tier,
			usage_limit_total, usage_count,
			TO_CHAR(valid_from, 'YYYY-MM-DD'), TO_CHAR(valid_until, 'YYYY-MM-DD'),
			is_active, created_at, updated_at
		FROM vouchers
		WHERE tenant_id = $1 AND upper(code) = upper($2)
	`

	var v domain.Voucher
	err := r.txMgr.Conn(ctx).QueryRow(ctx, query, tenantID, strings.TrimSpace(code)).Scan(
		&v.ID, &v.TenantID, &v.Code, &v.Title, &v.Description, &v.DiscountType, &v.DiscountValue,
		&v.MaxDiscountAmount, &v.MinPurchaseAmount, &v.MinMembershipTier,
		&v.UsageLimitTotal, &v.UsageCount,
		&v.ValidFrom, &v.ValidUntil,
		&v.IsActive, &v.CreatedAt, &v.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, domain.NewNotFoundError("VOUCHER_NOT_FOUND", fmt.Sprintf("Kode voucher '%s' tidak ditemukan", code))
		}
		return nil, fmt.Errorf("get voucher by code: %w", err)
	}
	return &v, nil
}

// CreateVoucher inserts a new promotional voucher.
func (r *CRMRepository) CreateVoucher(ctx context.Context, tenantID uuid.UUID, req domain.CreateVoucherRequest) (*domain.Voucher, error) {
	codeUpper := strings.ToUpper(strings.TrimSpace(req.Code))
	query := `
		INSERT INTO vouchers (
			tenant_id, code, title, description, discount_type, discount_value,
			max_discount_amount, min_purchase_amount, min_membership_tier,
			usage_limit_total, usage_count, valid_from, valid_until, is_active
		) VALUES (
			$1, $2, $3, $4, $5, $6,
			$7, $8, $9,
			$10, 0, $11::DATE, $12::DATE, true
		) RETURNING 
			id, tenant_id, code, title, description, discount_type, discount_value,
			max_discount_amount, min_purchase_amount, min_membership_tier,
			usage_limit_total, usage_count,
			TO_CHAR(valid_from, 'YYYY-MM-DD'), TO_CHAR(valid_until, 'YYYY-MM-DD'),
			is_active, created_at, updated_at
	`

	var v domain.Voucher
	err := r.txMgr.Conn(ctx).QueryRow(ctx, query,
		tenantID, codeUpper, req.Title, req.Description, req.DiscountType, req.DiscountValue,
		req.MaxDiscountAmount, req.MinPurchaseAmount, req.MinMembershipTier,
		req.UsageLimitTotal, req.ValidFrom, req.ValidUntil,
	).Scan(
		&v.ID, &v.TenantID, &v.Code, &v.Title, &v.Description, &v.DiscountType, &v.DiscountValue,
		&v.MaxDiscountAmount, &v.MinPurchaseAmount, &v.MinMembershipTier,
		&v.UsageLimitTotal, &v.UsageCount,
		&v.ValidFrom, &v.ValidUntil,
		&v.IsActive, &v.CreatedAt, &v.UpdatedAt,
	)
	if err != nil {
		if strings.Contains(err.Error(), "uq_vouchers_code") {
			return nil, domain.NewConflictError("VOUCHER_CODE_EXISTS", fmt.Sprintf("Kode voucher '%s' sudah pernah dibuat", codeUpper))
		}
		return nil, fmt.Errorf("create voucher: %w", err)
	}
	return &v, nil
}

// IncrementVoucherUsage increments the usage count of a voucher.
func (r *CRMRepository) IncrementVoucherUsage(ctx context.Context, tenantID uuid.UUID, voucherID uuid.UUID) error {
	query := `
		UPDATE vouchers 
		SET usage_count = usage_count + 1, updated_at = now()
		WHERE tenant_id = $1 AND id = $2
	`
	_, err := r.txMgr.Conn(ctx).Exec(ctx, query, tenantID, voucherID)
	return err
}
