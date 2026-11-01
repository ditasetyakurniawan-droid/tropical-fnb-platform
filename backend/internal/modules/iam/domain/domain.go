// Package domain declares the entities, value objects, and interfaces
// owned by the Identity & Access Management (IAM) module.
package domain

import (
	"context"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

// Outlet represents a restaurant branch (e.g. Tropical Steak House or Tropical Garden Resto).
type Outlet struct {
	ID                   uuid.UUID `json:"id"`
	Code                 string    `json:"code"`
	Slug                 string    `json:"slug"`
	Name                 string    `json:"name"`
	OutletType           string    `json:"outlet_type"`
	TaxPB1Percent        float64   `json:"tax_pb1_percent"`
	ServiceChargePercent float64   `json:"service_charge_percent"`
	Address              *string   `json:"address,omitempty"`
}

// UserProfile represents the public identity of an authenticated employee.
type UserProfile struct {
	ID        uuid.UUID  `json:"id"`
	TenantID  uuid.UUID  `json:"tenant_id"`
	Username  string     `json:"username"`
	FullName  string     `json:"full_name"`
	Email     *string    `json:"email,omitempty"`
	Phone     *string    `json:"phone,omitempty"`
	IsActive  bool       `json:"is_active"`
	LastLogin *time.Time `json:"last_login_at,omitempty"`
}

// UserWithCredentials contains internal authentication hashes.
type UserWithCredentials struct {
	Profile           UserProfile
	PasswordHash      string
	SupervisorPINHash *string
}

// RoleAssignment describes an assigned role and its outlet scope (nil = global/all outlets).
type RoleAssignment struct {
	RoleCode string     `json:"role_code"`
	RoleName string     `json:"role_name"`
	OutletID *uuid.UUID `json:"outlet_id,omitempty"`
}

// AuthClaims is the payload embedded inside the signed JWT.
type AuthClaims struct {
	jwt.RegisteredClaims
	TenantID    string   `json:"tenant_id"`
	Username    string   `json:"username"`
	FullName    string   `json:"full_name"`
	Roles       []string `json:"roles"`
	IsGlobalAll bool     `json:"is_global_all"` // true for OWNER / Group Level
	// OutletIDs lists the outlets the user may operate on. It is the server-side
	// source of truth for outlet isolation (X-Outlet-ID is only a client hint and
	// is validated against this list). A nil value means the token pre-dates this
	// claim and must be re-issued by logging in again.
	OutletIDs []string `json:"outlet_ids"`
}

// AuthToken is returned upon successful authentication.
type AuthToken struct {
	AccessToken        string           `json:"access_token"`
	ExpiresAt          time.Time        `json:"expires_at"`
	User               UserProfile      `json:"user"`
	Roles              []RoleAssignment `json:"roles"`
	AccessibleOutlets  []Outlet         `json:"accessible_outlets"`
	IsGlobalAllOutlets bool             `json:"is_global_all_outlets"`
}

// TokenManager abstracts JWT generation and verification.
type TokenManager interface {
	Generate(claims AuthClaims, expiry time.Duration) (string, time.Time, error)
	Verify(tokenString string) (*AuthClaims, error)
}

// UserRepository defines database operations for the IAM module.
type UserRepository interface {
	FindUserWithCredentials(ctx context.Context, username string) (*UserWithCredentials, error)
	FindUserRoles(ctx context.Context, tenantID, userID uuid.UUID) ([]RoleAssignment, error)
	FindAccessibleOutlets(ctx context.Context, tenantID, userID uuid.UUID) ([]Outlet, bool, error)
	UpdateLastLogin(ctx context.Context, tenantID, userID uuid.UUID) error
	VerifySupervisorPIN(ctx context.Context, tenantID uuid.UUID, outletID *uuid.UUID, pin string) (bool, string, error)
}
