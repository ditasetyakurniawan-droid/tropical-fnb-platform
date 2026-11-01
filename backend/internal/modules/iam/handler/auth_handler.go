// Package handler provides HTTP handlers for IAM operations.
package handler

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"

	"tropical-fnb/backend/internal/modules/iam/middleware"
	"tropical-fnb/backend/internal/modules/iam/usecase"
	"tropical-fnb/backend/internal/platform/httpx"
)

// AuthHandler handles HTTP requests for authentication and identity.
type AuthHandler struct {
	authUsecase *usecase.AuthUsecase
	log         *slog.Logger
}

// NewAuthHandler creates a new AuthHandler.
func NewAuthHandler(authUsecase *usecase.AuthUsecase, log *slog.Logger) *AuthHandler {
	return &AuthHandler{
		authUsecase: authUsecase,
		log:         log,
	}
}

// Login handles POST /api/v1/auth/login.
func (h *AuthHandler) Login(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, 64*1024)

	var req usecase.LoginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpx.Error(w, r, http.StatusBadRequest, "invalid_request", "payload JSON tidak valid")
		return
	}

	token, err := h.authUsecase.Login(r.Context(), req)
	if err != nil {
		if errors.Is(err, usecase.ErrInvalidCredentials) {
			httpx.Error(w, r, http.StatusUnauthorized, "invalid_credentials", "username atau password salah")
			return
		}
		if errors.Is(err, usecase.ErrAccountInactive) {
			httpx.Error(w, r, http.StatusForbidden, "account_inactive", "akun dinonaktifkan, hubungi administrator")
			return
		}

		h.log.Error("login error", "error", err, "username", req.Username)
		httpx.Error(w, r, http.StatusInternalServerError, "internal_error", "terjadi kesalahan pada server")
		return
	}

	httpx.JSON(w, http.StatusOK, token)
}

// Me handles GET /api/v1/auth/me.
func (h *AuthHandler) Me(w http.ResponseWriter, r *http.Request) {
	username := middleware.UsernameFromContext(r.Context())
	if username == "" {
		httpx.Error(w, r, http.StatusUnauthorized, "unauthorized", "otentikasi diperlukan")
		return
	}

	profile, err := h.authUsecase.GetProfile(r.Context(), username)
	if err != nil {
		if errors.Is(err, usecase.ErrInvalidCredentials) {
			httpx.Error(w, r, http.StatusNotFound, "user_not_found", "pengguna tidak ditemukan")
			return
		}
		if errors.Is(err, usecase.ErrAccountInactive) {
			httpx.Error(w, r, http.StatusForbidden, "account_inactive", "akun dinonaktifkan")
			return
		}

		h.log.Error("get profile error", "error", err, "username", username)
		httpx.Error(w, r, http.StatusInternalServerError, "internal_error", "terjadi kesalahan pada server")
		return
	}

	httpx.JSON(w, http.StatusOK, profile)
}

// VerifyPIN handles POST /api/v1/auth/verify-pin.
func (h *AuthHandler) VerifyPIN(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantIDFromContext(r.Context())
	if !ok {
		httpx.Error(w, r, http.StatusUnauthorized, "unauthorized", "otentikasi diperlukan")
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, 16*1024)

	var req usecase.VerifyPINRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpx.Error(w, r, http.StatusBadRequest, "invalid_request", "payload JSON tidak valid")
		return
	}

	resp, err := h.authUsecase.VerifySupervisorPIN(r.Context(), tenantID, req)
	if err != nil {
		if errors.Is(err, usecase.ErrInvalidPIN) {
			httpx.Error(w, r, http.StatusUnauthorized, "invalid_pin", "PIN supervisor tidak valid")
			return
		}

		h.log.Error("verify pin error", "error", err, "outlet_id", req.OutletID)
		httpx.Error(w, r, http.StatusInternalServerError, "internal_error", "terjadi kesalahan pada server")
		return
	}

	httpx.JSON(w, http.StatusOK, resp)
}
