// Package middleware provides authentication and context injection for the IAM module.
package middleware

import (
	"context"
	"net/http"
	"strings"

	"github.com/google/uuid"

	"tropical-fnb/backend/internal/modules/iam/domain"
	"tropical-fnb/backend/internal/platform/httpx"
	"tropical-fnb/backend/internal/platform/logger"
)

type contextKey struct{ name string }

var (
	tenantIDKey       = contextKey{name: "tenant_id"}
	usernameKey       = contextKey{name: "username"}
	fullNameKey       = contextKey{name: "full_name"}
	rolesKey          = contextKey{name: "roles"}
	isGlobalKey       = contextKey{name: "is_global"}
	activeOutletIDKey = contextKey{name: "active_outlet_id"}
	allowedOutletsKey = contextKey{name: "allowed_outlet_ids"}
)

// Authenticate verifies the Bearer JWT token and extracts claims into the request context.
func Authenticate(tokenManager domain.TokenManager) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			authHeader := r.Header.Get("Authorization")
			if authHeader == "" {
				httpx.Error(w, r, http.StatusUnauthorized, "unauthorized", "token otentikasi diperlukan")
				return
			}

			parts := strings.SplitN(authHeader, " ", 2)
			if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") {
				httpx.Error(w, r, http.StatusUnauthorized, "invalid_token", "format token harus Bearer <token>")
				return
			}

			tokenString := strings.TrimSpace(parts[1])
			claims, err := tokenManager.Verify(tokenString)
			if err != nil {
				httpx.Error(w, r, http.StatusUnauthorized, "invalid_token", "token tidak valid atau sudah kedaluwarsa")
				return
			}

			isGlobal := claims.IsGlobalAll
			for _, ro := range claims.Roles {
				if ro == "SUPERADMIN" || ro == "OWNER" {
					isGlobal = true
					break
				}
			}

			// Outlet isolation: the JWT outlet list is the source of truth. Tokens
			// issued before this claim existed are rejected for outlet-scoped users.
			if !isGlobal && claims.OutletIDs == nil {
				httpx.Error(w, r, http.StatusUnauthorized, "token_outdated", "sesi kedaluwarsa karena pembaruan keamanan, silakan login ulang")
				return
			}
			allowed := make(map[uuid.UUID]struct{}, len(claims.OutletIDs))
			for _, raw := range claims.OutletIDs {
				if oid, err := uuid.Parse(raw); err == nil {
					allowed[oid] = struct{}{}
				}
			}

			ctx := r.Context()
			if tid, err := uuid.Parse(claims.TenantID); err == nil {
				ctx = context.WithValue(ctx, tenantIDKey, tid)
			}
			ctx = context.WithValue(ctx, usernameKey, claims.Username)
			ctx = context.WithValue(ctx, fullNameKey, claims.FullName)
			ctx = context.WithValue(ctx, rolesKey, claims.Roles)
			ctx = context.WithValue(ctx, isGlobalKey, isGlobal)
			ctx = context.WithValue(ctx, allowedOutletsKey, allowed)

			// Active outlet requested by the client (X-Outlet-ID header or ?outlet_id=).
			requested, hasRequested, badRequest := parseRequestedOutlet(r)
			if badRequest && !isGlobal {
				httpx.Error(w, r, http.StatusBadRequest, "invalid_outlet", "outlet_id tidak valid")
				return
			}

			if isGlobal {
				if hasRequested {
					ctx = context.WithValue(ctx, activeOutletIDKey, requested)
				}
			} else {
				if hasRequested {
					if _, ok := allowed[requested]; !ok {
						logger.Annotate(r.Context(), "error_code", "outlet_forbidden")
						httpx.Error(w, r, http.StatusForbidden, "outlet_forbidden", "anda tidak memiliki akses ke outlet ini")
						return
					}
					ctx = context.WithValue(ctx, activeOutletIDKey, requested)
				} else if len(allowed) == 1 {
					// Single-outlet staff are always pinned to their own outlet, even
					// when the client omits the outlet or asks for "ALL".
					for oid := range allowed {
						ctx = context.WithValue(ctx, activeOutletIDKey, oid)
						q := r.URL.Query()
						q.Set("outlet_id", oid.String())
						r.URL.RawQuery = q.Encode()
					}
				}
			}
			if oid, ok := ctx.Value(activeOutletIDKey).(uuid.UUID); ok {
				logger.Annotate(r.Context(), "outlet_id", oid.String())
			}
			logger.Annotate(r.Context(), "user_id", claims.Username)
			logger.Annotate(r.Context(), "tenant_id", claims.TenantID)

			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// TenantIDFromContext returns the authenticated tenant ID.
func TenantIDFromContext(ctx context.Context) (uuid.UUID, bool) {
	val, ok := ctx.Value(tenantIDKey).(uuid.UUID)
	return val, ok
}

// UsernameFromContext returns the authenticated username.
func UsernameFromContext(ctx context.Context) string {
	val, _ := ctx.Value(usernameKey).(string)
	return val
}

// ActiveOutletIDFromContext returns the optional active outlet ID selected by the client.
func ActiveOutletIDFromContext(ctx context.Context) (uuid.UUID, bool) {
	val, ok := ctx.Value(activeOutletIDKey).(uuid.UUID)
	return val, ok
}

// RolesFromContext returns the authenticated user roles.
func RolesFromContext(ctx context.Context) []string {
	val, ok := ctx.Value(rolesKey).([]string)
	if !ok {
		return nil
	}
	return val
}

// parseRequestedOutlet extracts the outlet the client wants to act on from the
// X-Outlet-ID header (preferred) or the outlet_id query parameter. "ALL" and empty
// values mean "not specified". badRequest is true when a value is present but is
// not a valid UUID.
func parseRequestedOutlet(r *http.Request) (outletID uuid.UUID, ok bool, badRequest bool) {
	for _, raw := range []string{r.Header.Get("X-Outlet-ID"), r.URL.Query().Get("outlet_id")} {
		raw = strings.TrimSpace(raw)
		if raw == "" || strings.EqualFold(raw, "ALL") {
			continue
		}
		oid, err := uuid.Parse(raw)
		if err != nil {
			return uuid.Nil, false, true
		}
		return oid, true, false
	}
	return uuid.Nil, false, false
}

// IsGlobalFromContext reports whether the caller may act on every outlet (OWNER / group level).
func IsGlobalFromContext(ctx context.Context) bool {
	val, _ := ctx.Value(isGlobalKey).(bool)
	return val
}

// AllowedOutletsFromContext returns the outlets the authenticated user may access.
func AllowedOutletsFromContext(ctx context.Context) []uuid.UUID {
	m, _ := ctx.Value(allowedOutletsKey).(map[uuid.UUID]struct{})
	out := make([]uuid.UUID, 0, len(m))
	for id := range m {
		out = append(out, id)
	}
	return out
}

// RequireOutletAccess reports whether the authenticated user is allowed to act on
// the given outlet. Global users are always allowed; everyone else must have the
// outlet in their JWT outlet list.
func RequireOutletAccess(ctx context.Context, outletID uuid.UUID) bool {
	if IsGlobalFromContext(ctx) {
		return true
	}
	m, _ := ctx.Value(allowedOutletsKey).(map[uuid.UUID]struct{})
	_, ok := m[outletID]
	return ok
}
