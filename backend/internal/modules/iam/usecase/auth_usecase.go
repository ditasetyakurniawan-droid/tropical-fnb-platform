// Package usecase coordinates IAM business rules and orchestrates repositories.
package usecase

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"

	"tropical-fnb/backend/internal/modules/iam/domain"
)

var (
	ErrInvalidCredentials = errors.New("username atau password salah")
	ErrAccountInactive    = errors.New("akun dinonaktifkan, hubungi administrator")
	ErrInvalidPIN         = errors.New("PIN supervisor tidak valid")
	ErrUnauthorized       = errors.New("tidak memiliki hak akses")
)

// LoginRequest input payload.
type LoginRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

// VerifyPINRequest input for supervisor authorization at the POS.
type VerifyPINRequest struct {
	OutletID uuid.UUID `json:"outlet_id"`
	PIN      string    `json:"pin"`
	Action   string    `json:"action"` // e.g. VOID_ORDER, DISCOUNT
}

// VerifyPINResponse output.
type VerifyPINResponse struct {
	Valid          bool   `json:"valid"`
	SupervisorName string `json:"supervisor_name,omitempty"`
}

// UserProfileResponse output for /me endpoint.
type UserProfileResponse struct {
	User               domain.UserProfile      `json:"user"`
	Roles              []domain.RoleAssignment `json:"roles"`
	AccessibleOutlets  []domain.Outlet         `json:"accessible_outlets"`
	IsGlobalAllOutlets bool                    `json:"is_global_all_outlets"`
}

// AuthUsecase provides authentication operations.
type AuthUsecase struct {
	userRepo     domain.UserRepository
	tokenManager domain.TokenManager
	tokenExpiry  time.Duration
}

// NewAuthUsecase creates a new AuthUsecase.
func NewAuthUsecase(
	userRepo domain.UserRepository,
	tokenManager domain.TokenManager,
	tokenExpiry time.Duration,
) *AuthUsecase {
	if tokenExpiry <= 0 {
		tokenExpiry = 24 * time.Hour
	}
	return &AuthUsecase{
		userRepo:     userRepo,
		tokenManager: tokenManager,
		tokenExpiry:  tokenExpiry,
	}
}

// Login verifies credentials, resolves accessible outlets, and issues an AuthToken.
func (u *AuthUsecase) Login(ctx context.Context, req LoginRequest) (*domain.AuthToken, error) {
	username := strings.TrimSpace(req.Username)
	if username == "" || req.Password == "" {
		return nil, ErrInvalidCredentials
	}

	user, err := u.userRepo.FindUserWithCredentials(ctx, username)
	if err != nil {
		return nil, fmt.Errorf("lookup user: %w", err)
	}
	if user == nil {
		return nil, ErrInvalidCredentials
	}

	if !user.Profile.IsActive {
		return nil, ErrAccountInactive
	}

	// Verify bcrypt password hash
	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(req.Password)); err != nil {
		return nil, ErrInvalidCredentials
	}

	// Fetch assigned roles and accessible outlets
	roles, err := u.userRepo.FindUserRoles(ctx, user.Profile.TenantID, user.Profile.ID)
	if err != nil {
		return nil, fmt.Errorf("lookup roles: %w", err)
	}

	outlets, isGlobal, err := u.userRepo.FindAccessibleOutlets(ctx, user.Profile.TenantID, user.Profile.ID)
	if err != nil {
		return nil, fmt.Errorf("lookup outlets: %w", err)
	}

	roleCodes := make([]string, len(roles))
	for i, r := range roles {
		roleCodes[i] = r.RoleCode
	}

	outletIDs := make([]string, 0, len(outlets))
	for _, o := range outlets {
		outletIDs = append(outletIDs, o.ID.String())
	}

	claims := domain.AuthClaims{
		OutletIDs:   outletIDs,
		TenantID:    user.Profile.TenantID.String(),
		Username:    user.Profile.Username,
		FullName:    user.Profile.FullName,
		Roles:       roleCodes,
		IsGlobalAll: isGlobal,
	}

	tokenStr, expiresAt, err := u.tokenManager.Generate(claims, u.tokenExpiry)
	if err != nil {
		return nil, fmt.Errorf("generate token: %w", err)
	}

	_ = u.userRepo.UpdateLastLogin(ctx, user.Profile.TenantID, user.Profile.ID)

	return &domain.AuthToken{
		AccessToken:        tokenStr,
		ExpiresAt:          expiresAt,
		User:               user.Profile,
		Roles:              roles,
		AccessibleOutlets:  outlets,
		IsGlobalAllOutlets: isGlobal,
	}, nil
}

// VerifySupervisorPIN validates the 6-digit PIN of a supervisor for sensitive POS operations.
func (u *AuthUsecase) VerifySupervisorPIN(ctx context.Context, tenantID uuid.UUID, req VerifyPINRequest) (*VerifyPINResponse, error) {
	pin := strings.TrimSpace(req.PIN)
	if pin == "" {
		return nil, ErrInvalidPIN
	}

	valid, supervisorName, err := u.userRepo.VerifySupervisorPIN(ctx, tenantID, &req.OutletID, pin)
	if err != nil {
		return nil, fmt.Errorf("verify pin: %w", err)
	}

	if !valid {
		return &VerifyPINResponse{Valid: false}, ErrInvalidPIN
	}

	return &VerifyPINResponse{
		Valid:          true,
		SupervisorName: supervisorName,
	}, nil
}

// GetProfile retrieves the profile, roles, and accessible outlets for the given username.
func (u *AuthUsecase) GetProfile(ctx context.Context, username string) (*UserProfileResponse, error) {
	username = strings.TrimSpace(username)
	if username == "" {
		return nil, ErrInvalidCredentials
	}

	user, err := u.userRepo.FindUserWithCredentials(ctx, username)
	if err != nil {
		return nil, fmt.Errorf("lookup user: %w", err)
	}
	if user == nil {
		return nil, ErrInvalidCredentials
	}

	if !user.Profile.IsActive {
		return nil, ErrAccountInactive
	}

	roles, err := u.userRepo.FindUserRoles(ctx, user.Profile.TenantID, user.Profile.ID)
	if err != nil {
		return nil, fmt.Errorf("lookup roles: %w", err)
	}

	outlets, isGlobal, err := u.userRepo.FindAccessibleOutlets(ctx, user.Profile.TenantID, user.Profile.ID)
	if err != nil {
		return nil, fmt.Errorf("lookup outlets: %w", err)
	}

	return &UserProfileResponse{
		User:               user.Profile,
		Roles:              roles,
		AccessibleOutlets:  outlets,
		IsGlobalAllOutlets: isGlobal,
	}, nil
}
