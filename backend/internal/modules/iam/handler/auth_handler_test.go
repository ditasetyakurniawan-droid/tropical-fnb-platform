package handler_test

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"

	"tropical-fnb/backend/internal/modules/iam/domain"
	"tropical-fnb/backend/internal/modules/iam/handler"
	"tropical-fnb/backend/internal/modules/iam/middleware"
	"tropical-fnb/backend/internal/modules/iam/token"
	"tropical-fnb/backend/internal/modules/iam/usecase"
)

type mockUserRepo struct {
	user     *domain.UserWithCredentials
	roles    []domain.RoleAssignment
	outlets  []domain.Outlet
	isGlobal bool
	pinValid bool
	spvName  string
}

func (m *mockUserRepo) FindUserWithCredentials(ctx context.Context, username string) (*domain.UserWithCredentials, error) {
	if m.user != nil && m.user.Profile.Username == username {
		return m.user, nil
	}
	return nil, nil
}

func (m *mockUserRepo) FindUserRoles(ctx context.Context, tenantID, userID uuid.UUID) ([]domain.RoleAssignment, error) {
	return m.roles, nil
}

func (m *mockUserRepo) FindAccessibleOutlets(ctx context.Context, tenantID, userID uuid.UUID) ([]domain.Outlet, bool, error) {
	return m.outlets, m.isGlobal, nil
}

func (m *mockUserRepo) UpdateLastLogin(ctx context.Context, tenantID, userID uuid.UUID) error {
	return nil
}

func (m *mockUserRepo) VerifySupervisorPIN(ctx context.Context, tenantID uuid.UUID, outletID *uuid.UUID, pin string) (bool, string, error) {
	return m.pinValid, m.spvName, nil
}

func setupTestRouter(repo domain.UserRepository, jwtSecret string) (http.Handler, *token.JWTManager) {
	log := slog.New(slog.NewTextHandler(io.Discard, nil))
	jwtMgr, err := token.NewJWTManager(jwtSecret)
	if err != nil {
		panic(err)
	}
	authUc := usecase.NewAuthUsecase(repo, jwtMgr, 1*time.Hour)
	h := handler.NewAuthHandler(authUc, log)

	r := chi.NewRouter()
	r.Route("/api/v1", func(api chi.Router) {
		api.Post("/auth/login", h.Login)
		api.Group(func(protected chi.Router) {
			protected.Use(middleware.Authenticate(jwtMgr))
			protected.Get("/auth/me", h.Me)
			protected.Post("/auth/verify-pin", h.VerifyPIN)
		})
	})

	return r, jwtMgr
}

func TestAuthHandler_Login(t *testing.T) {
	secret := "a-very-long-32-byte-secret-key-for-test-purposes!"
	passHash, _ := bcrypt.GenerateFromPassword([]byte("Secret123!"), bcrypt.MinCost)
	tenantID := uuid.New()
	userID := uuid.New()
	outletID := uuid.New()

	repo := &mockUserRepo{
		user: &domain.UserWithCredentials{
			Profile: domain.UserProfile{
				ID:       userID,
				TenantID: tenantID,
				Username: "owner",
				FullName: "Tropical Owner",
				IsActive: true,
			},
			PasswordHash: string(passHash),
		},
		roles: []domain.RoleAssignment{
			{RoleCode: "OWNER", RoleName: "Owner Tropical Group"},
		},
		outlets: []domain.Outlet{
			{ID: outletID, Code: "TSH-01", Name: "Tropical Steak House", Slug: "tropical-steak-house"},
		},
		isGlobal: true,
	}

	router, _ := setupTestRouter(repo, secret)

	t.Run("invalid json", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/login", bytes.NewBufferString("invalid json"))
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, req)

		if rec.Code != http.StatusBadRequest {
			t.Fatalf("expected 400, got %d", rec.Code)
		}
	})

	t.Run("wrong password", func(t *testing.T) {
		body, _ := json.Marshal(map[string]string{
			"username": "owner",
			"password": "WrongPassword!",
		})
		req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/login", bytes.NewReader(body))
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, req)

		if rec.Code != http.StatusUnauthorized {
			t.Fatalf("expected 401, got %d", rec.Code)
		}
	})

	t.Run("successful login", func(t *testing.T) {
		body, _ := json.Marshal(map[string]string{
			"username": "owner",
			"password": "Secret123!",
		})
		req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/login", bytes.NewReader(body))
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
		}

		var resp domain.AuthToken
		if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
			t.Fatalf("failed to decode response: %v", err)
		}

		if resp.AccessToken == "" {
			t.Errorf("expected non-empty access_token")
		}
		if resp.User.Username != "owner" {
			t.Errorf("expected username owner, got %s", resp.User.Username)
		}
		if !resp.IsGlobalAllOutlets {
			t.Errorf("expected is_global_all_outlets = true")
		}
		if len(resp.AccessibleOutlets) != 1 {
			t.Errorf("expected 1 outlet, got %d", len(resp.AccessibleOutlets))
		}
	})
}

func TestAuthHandler_Me(t *testing.T) {
	secret := "a-very-long-32-byte-secret-key-for-test-purposes!"
	tenantID := uuid.New()
	userID := uuid.New()

	repo := &mockUserRepo{
		user: &domain.UserWithCredentials{
			Profile: domain.UserProfile{
				ID:       userID,
				TenantID: tenantID,
				Username: "owner",
				FullName: "Tropical Owner",
				IsActive: true,
			},
		},
		roles: []domain.RoleAssignment{
			{RoleCode: "OWNER", RoleName: "Owner"},
		},
		isGlobal: true,
	}

	router, jwtMgr := setupTestRouter(repo, secret)

	t.Run("unauthorized without header", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/v1/auth/me", nil)
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, req)

		if rec.Code != http.StatusUnauthorized {
			t.Fatalf("expected 401, got %d", rec.Code)
		}
	})

	t.Run("authorized with valid token", func(t *testing.T) {
		tokenStr, _, err := jwtMgr.Generate(domain.AuthClaims{
			TenantID:    tenantID.String(),
			Username:    "owner",
			FullName:    "Tropical Owner",
			Roles:       []string{"OWNER"},
			IsGlobalAll: true,
		}, 1*time.Hour)
		if err != nil {
			t.Fatalf("failed to generate token: %v", err)
		}

		req := httptest.NewRequest(http.MethodGet, "/api/v1/auth/me", nil)
		req.Header.Set("Authorization", "Bearer "+tokenStr)
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
		}

		var profile usecase.UserProfileResponse
		if err := json.Unmarshal(rec.Body.Bytes(), &profile); err != nil {
			t.Fatalf("failed to unmarshal profile: %v", err)
		}
		if profile.User.Username != "owner" {
			t.Errorf("expected username owner, got %s", profile.User.Username)
		}
	})
}

func TestAuthHandler_VerifyPIN(t *testing.T) {
	secret := "a-very-long-32-byte-secret-key-for-test-purposes!"
	tenantID := uuid.New()
	outletID := uuid.New()

	repo := &mockUserRepo{
		pinValid: true,
		spvName:  "Budi Supervisor",
	}

	router, jwtMgr := setupTestRouter(repo, secret)
	tokenStr, _, _ := jwtMgr.Generate(domain.AuthClaims{
		TenantID:    tenantID.String(),
		Username:    "kasir_steak",
		FullName:    "Kasir Steak",
		Roles:       []string{"CASHIER"},
		IsGlobalAll: false,
		OutletIDs:   []string{outletID.String()},
	}, 1*time.Hour)

	t.Run("valid pin", func(t *testing.T) {
		body, _ := json.Marshal(usecase.VerifyPINRequest{
			OutletID: outletID,
			PIN:      "123456",
			Action:   "VOID_ORDER",
		})
		req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/verify-pin", bytes.NewReader(body))
		req.Header.Set("Authorization", "Bearer "+tokenStr)
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
		}

		var resp usecase.VerifyPINResponse
		if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
			t.Fatalf("failed to decode json: %v", err)
		}
		if !resp.Valid || resp.SupervisorName != "Budi Supervisor" {
			t.Fatalf("unexpected response: %+v", resp)
		}
	})
}
