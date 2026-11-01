// Package repository provides PostgreSQL access for the IAM module.
package repository

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"golang.org/x/crypto/bcrypt"

	"tropical-fnb/backend/internal/modules/iam/domain"
	"tropical-fnb/backend/internal/platform/database"
)

// PostgresUserRepository implements domain.UserRepository.
type PostgresUserRepository struct {
	txMgr *database.TxManager
}

// NewPostgresUserRepository creates a new repository.
func NewPostgresUserRepository(txMgr *database.TxManager) *PostgresUserRepository {
	return &PostgresUserRepository{txMgr: txMgr}
}

// FindUserWithCredentials looks up a user by username across active accounts.
func (r *PostgresUserRepository) FindUserWithCredentials(ctx context.Context, username string) (*domain.UserWithCredentials, error) {
	query := `
		SELECT
			id, tenant_id, username, full_name, email, phone,
			is_active, last_login_at, password_hash, supervisor_pin_hash
		FROM users
		WHERE username = $1 AND deleted_at IS NULL
	`

	var u domain.UserWithCredentials
	err := r.txMgr.Conn(ctx).QueryRow(ctx, query, username).Scan(
		&u.Profile.ID,
		&u.Profile.TenantID,
		&u.Profile.Username,
		&u.Profile.FullName,
		&u.Profile.Email,
		&u.Profile.Phone,
		&u.Profile.IsActive,
		&u.Profile.LastLogin,
		&u.PasswordHash,
		&u.SupervisorPINHash,
	)

	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil // not found
		}
		return nil, fmt.Errorf("find user: %w", err)
	}

	return &u, nil
}

// FindUserRoles retrieves all role assignments for a user.
func (r *PostgresUserRepository) FindUserRoles(ctx context.Context, tenantID, userID uuid.UUID) ([]domain.RoleAssignment, error) {
	query := `
		SELECT r.code, r.name, ura.outlet_id
		FROM user_role_assignments ura
		JOIN roles r ON r.id = ura.role_id
		WHERE ura.tenant_id = $1 AND ura.user_id = $2
		ORDER BY r.code
	`

	rows, err := r.txMgr.Conn(ctx).Query(ctx, query, tenantID, userID)
	if err != nil {
		return nil, fmt.Errorf("find user roles: %w", err)
	}
	defer rows.Close()

	var roles []domain.RoleAssignment
	for rows.Next() {
		var ra domain.RoleAssignment
		if err := rows.Scan(&ra.RoleCode, &ra.RoleName, &ra.OutletID); err != nil {
			return nil, fmt.Errorf("scan role: %w", err)
		}
		roles = append(roles, ra)
	}

	return roles, rows.Err()
}

// FindAccessibleOutlets returns all outlets the user can access.
// If the user has any global role (outlet_id IS NULL), isGlobal is true and all tenant outlets are returned.
func (r *PostgresUserRepository) FindAccessibleOutlets(ctx context.Context, tenantID, userID uuid.UUID) ([]domain.Outlet, bool, error) {
	// Check if user has global assignment (e.g. OWNER)
	var hasGlobal bool
	checkQuery := `
		SELECT EXISTS (
			SELECT 1 FROM user_role_assignments
			WHERE tenant_id = $1 AND user_id = $2 AND outlet_id IS NULL
		)
	`
	if err := r.txMgr.Conn(ctx).QueryRow(ctx, checkQuery, tenantID, userID).Scan(&hasGlobal); err != nil {
		return nil, false, fmt.Errorf("check global role: %w", err)
	}

	var outletQuery string
	var args []any

	if hasGlobal {
		outletQuery = `
			SELECT id, code, slug, name, outlet_type, tax_pb1_percent, service_charge_percent, address
			FROM outlets
			WHERE tenant_id = $1 AND deleted_at IS NULL AND is_active = true
			ORDER BY code
		`
		args = []any{tenantID}
	} else {
		outletQuery = `
			SELECT DISTINCT o.id, o.code, o.slug, o.name, o.outlet_type, o.tax_pb1_percent, o.service_charge_percent, o.address
			FROM user_role_assignments ura
			JOIN outlets o ON o.id = ura.outlet_id
			WHERE ura.tenant_id = $1 AND ura.user_id = $2
			  AND o.deleted_at IS NULL AND o.is_active = true
			ORDER BY o.code
		`
		args = []any{tenantID, userID}
	}

	rows, err := r.txMgr.Conn(ctx).Query(ctx, outletQuery, args...)
	if err != nil {
		return nil, false, fmt.Errorf("find accessible outlets: %w", err)
	}
	defer rows.Close()

	var outlets []domain.Outlet
	for rows.Next() {
		var o domain.Outlet
		if err := rows.Scan(
			&o.ID,
			&o.Code,
			&o.Slug,
			&o.Name,
			&o.OutletType,
			&o.TaxPB1Percent,
			&o.ServiceChargePercent,
			&o.Address,
		); err != nil {
			return nil, false, fmt.Errorf("scan outlet: %w", err)
		}
		outlets = append(outlets, o)
	}

	return outlets, hasGlobal, rows.Err()
}

// UpdateLastLogin updates the last_login_at timestamp.
func (r *PostgresUserRepository) UpdateLastLogin(ctx context.Context, tenantID, userID uuid.UUID) error {
	query := `UPDATE users SET last_login_at = now() WHERE tenant_id = $1 AND id = $2`
	_, err := r.txMgr.Conn(ctx).Exec(ctx, query, tenantID, userID)
	return err
}

// VerifySupervisorPIN checks if the provided PIN matches any supervisor/manager of the outlet.
func (r *PostgresUserRepository) VerifySupervisorPIN(ctx context.Context, tenantID uuid.UUID, outletID *uuid.UUID, pin string) (bool, string, error) {
	query := `
		SELECT u.full_name, u.supervisor_pin_hash
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
		return false, "", fmt.Errorf("query supervisors: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var fullName string
		var pinHash string
		if err := rows.Scan(&fullName, &pinHash); err != nil {
			return false, "", err
		}
		if bcrypt.CompareHashAndPassword([]byte(pinHash), []byte(pin)) == nil {
			return true, fullName, nil
		}
	}

	return false, "", nil
}
