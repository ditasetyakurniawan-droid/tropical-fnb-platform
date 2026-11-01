// Package domain defines the entities, requests, responses, and errors for CRM and Loyalty.
package domain

import (
	"fmt"
	"time"

	"github.com/google/uuid"
)

// Membership Tier Constants
const (
	TierBronze      = "BRONZE"
	TierSilver      = "SILVER"
	TierGold        = "GOLD"
	TierTropicalVIP = "TROPICAL_VIP"
)

// Points Transaction Types
const (
	TxTypeEarn       = "EARN"
	TxTypeRedeem     = "REDEEM"
	TxTypeAdjustment = "ADJUSTMENT"
	TxTypeExpired    = "EXPIRED"
)

// Voucher Discount Types
const (
	DiscountTypePercentage  = "PERCENTAGE"
	DiscountTypeFixedAmount = "FIXED_AMOUNT"
)

// Permissions
const (
	PermCRMView   = "crm:view"
	PermCRMManage = "crm:manage"
)

// Customer represents a customer profile in CRM.
type Customer struct {
	ID             uuid.UUID `json:"id"`
	TenantID       uuid.UUID `json:"tenant_id"`
	Phone          string    `json:"phone"`
	Name           string    `json:"name"`
	Email          *string   `json:"email,omitempty"`
	MembershipTier string    `json:"membership_tier"`
	PointsBalance  int       `json:"points_balance"`
	LifetimeSpend  float64   `json:"lifetime_spend"`
	VisitCount     int       `json:"visit_count"`
	Birthday       *string   `json:"birthday,omitempty"` // YYYY-MM-DD
	DietaryNotes   *string   `json:"dietary_notes,omitempty"`
	Preferences    *string   `json:"preferences,omitempty"`
	CreatedAt      time.Time `json:"created_at"`
	UpdatedAt      time.Time `json:"updated_at"`
}

// PointsLedgerEntry represents an individual points earn/redeem audit record.
type PointsLedgerEntry struct {
	ID            uuid.UUID  `json:"id"`
	TenantID      uuid.UUID  `json:"tenant_id"`
	CustomerID    uuid.UUID  `json:"customer_id"`
	CustomerName  string     `json:"customer_name"`
	CustomerPhone string     `json:"customer_phone"`
	OrderID       *uuid.UUID `json:"order_id,omitempty"`
	TxType        string     `json:"tx_type"`
	Points        int        `json:"points"`
	BalanceAfter  int        `json:"balance_after"`
	Description   string     `json:"description"`
	CreatedAt     time.Time  `json:"created_at"`
}

// CustomerDetail provides customer info along with their recent loyalty ledger history.
type CustomerDetail struct {
	Customer
	RecentPoints []PointsLedgerEntry `json:"recent_points"`
}

// Voucher represents a promotional voucher or discount campaign.
type Voucher struct {
	ID                uuid.UUID `json:"id"`
	TenantID          uuid.UUID `json:"tenant_id"`
	Code              string    `json:"code"`
	Title             string    `json:"title"`
	Description       *string   `json:"description,omitempty"`
	DiscountType      string    `json:"discount_type"`
	DiscountValue     float64   `json:"discount_value"`
	MaxDiscountAmount *float64  `json:"max_discount_amount,omitempty"`
	MinPurchaseAmount float64   `json:"min_purchase_amount"`
	MinMembershipTier *string   `json:"min_membership_tier,omitempty"`
	UsageLimitTotal   int       `json:"usage_limit_total"`
	UsageCount        int       `json:"usage_count"`
	ValidFrom         string    `json:"valid_from"`  // YYYY-MM-DD
	ValidUntil        string    `json:"valid_until"` // YYYY-MM-DD
	IsActive          bool      `json:"is_active"`
	CreatedAt         time.Time `json:"created_at"`
	UpdatedAt         time.Time `json:"updated_at"`
}

// CreateCustomerRequest is the payload to register a new customer.
type CreateCustomerRequest struct {
	Phone        string  `json:"phone"`
	Name         string  `json:"name"`
	Email        *string `json:"email,omitempty"`
	Birthday     *string `json:"birthday,omitempty"`
	DietaryNotes *string `json:"dietary_notes,omitempty"`
	Preferences  *string `json:"preferences,omitempty"`
}

// UpdateCustomerRequest updates customer profile notes and details.
type UpdateCustomerRequest struct {
	Name           string  `json:"name"`
	Email          *string `json:"email,omitempty"`
	Birthday       *string `json:"birthday,omitempty"`
	DietaryNotes   *string `json:"dietary_notes,omitempty"`
	Preferences    *string `json:"preferences,omitempty"`
	MembershipTier *string `json:"membership_tier,omitempty"`
}

// AdjustPointsRequest is the payload to credit or debit customer loyalty points.
type AdjustPointsRequest struct {
	TxType      string     `json:"tx_type"` // EARN, REDEEM, ADJUSTMENT
	Points      int        `json:"points"`
	Description string     `json:"description"`
	OrderID     *uuid.UUID `json:"order_id,omitempty"`
}

// CreateVoucherRequest is the payload to create a new promo voucher.
type CreateVoucherRequest struct {
	Code              string   `json:"code"`
	Title             string   `json:"title"`
	Description       *string  `json:"description,omitempty"`
	DiscountType      string   `json:"discount_type"` // PERCENTAGE, FIXED_AMOUNT
	DiscountValue     float64  `json:"discount_value"`
	MaxDiscountAmount *float64 `json:"max_discount_amount,omitempty"`
	MinPurchaseAmount float64  `json:"min_purchase_amount"`
	MinMembershipTier *string  `json:"min_membership_tier,omitempty"`
	UsageLimitTotal   int      `json:"usage_limit_total"`
	ValidFrom         string   `json:"valid_from"`
	ValidUntil        string   `json:"valid_until"`
}

// ValidateVoucherRequest is the input to test voucher applicability on an order subtotal.
type ValidateVoucherRequest struct {
	Code       string     `json:"code"`
	Subtotal   float64    `json:"subtotal"`
	CustomerID *uuid.UUID `json:"customer_id,omitempty"`
}

// ValidateVoucherResponse contains the discount evaluation result.
type ValidateVoucherResponse struct {
	Valid          bool     `json:"valid"`
	DiscountAmount float64  `json:"discount_amount"`
	Message        string   `json:"message"`
	Voucher        *Voucher `json:"voucher,omitempty"`
}

// Actor represents the caller identity extracted from JWT.
type Actor struct {
	TenantID    uuid.UUID
	Username    string
	Roles       []string
	Permissions map[string]struct{}
}

// HasPermission checks if the actor possesses the specified permission.
func (a Actor) HasPermission(perm string) bool {
	_, ok := a.Permissions[perm]
	return ok
}

// Error kinds
type ErrorKind int

const (
	KindValidation ErrorKind = iota
	KindNotFound
	KindUnauthorized
	KindConflict
	KindInternal
)

// DomainError represents a business logic or validation error.
type DomainError struct {
	Kind    ErrorKind
	Message string
	Code    string
}

func (e *DomainError) Error() string {
	return fmt.Sprintf("[%s] %s", e.Code, e.Message)
}

func NewValidationError(code, msg string) *DomainError {
	return &DomainError{Kind: KindValidation, Code: code, Message: msg}
}

func NewNotFoundError(code, msg string) *DomainError {
	return &DomainError{Kind: KindNotFound, Code: code, Message: msg}
}

func NewConflictError(code, msg string) *DomainError {
	return &DomainError{Kind: KindConflict, Code: code, Message: msg}
}
