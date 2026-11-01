package token_test

import (
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"

	"tropical-fnb/backend/internal/modules/iam/domain"
	"tropical-fnb/backend/internal/modules/iam/token"
)

const testSecret = "super-secret-key-that-is-at-least-32-characters-long"

func TestNewJWTManager_RejectsShortSecret(t *testing.T) {
	_, err := token.NewJWTManager("short")
	if err == nil {
		t.Fatal("expected error for short secret")
	}
}

func TestJWTManager_GenerateAndVerify(t *testing.T) {
	mgr, err := token.NewJWTManager(testSecret)
	if err != nil {
		t.Fatal(err)
	}

	claims := domain.AuthClaims{
		TenantID:    "01950000-0000-7000-8000-000000000001",
		Username:    "owner",
		FullName:    "Budi Santoso",
		Roles:       []string{"OWNER"},
		IsGlobalAll: true,
	}

	tokenString, expiresAt, err := mgr.Generate(claims, 2*time.Hour)
	if err != nil {
		t.Fatalf("generate: %v", err)
	}
	if tokenString == "" || expiresAt.Before(time.Now()) {
		t.Fatalf("unexpected token output: %s %v", tokenString, expiresAt)
	}

	parsed, err := mgr.Verify(tokenString)
	if err != nil {
		t.Fatalf("verify: %v", err)
	}

	if parsed.Username != "owner" || parsed.FullName != "Budi Santoso" || !parsed.IsGlobalAll {
		t.Fatalf("claims mismatch: %+v", parsed)
	}
}

func TestJWTManager_RejectsTamperedToken(t *testing.T) {
	mgr, _ := token.NewJWTManager(testSecret)
	otherMgr, _ := token.NewJWTManager("another-different-key-also-at-least-32-characters")

	tokenString, _, _ := mgr.Generate(domain.AuthClaims{Username: "attacker"}, time.Hour)

	_, err := otherMgr.Verify(tokenString)
	if err == nil {
		t.Fatal("expected verification to fail for token signed with different key")
	}
}

func TestJWTManager_RejectsExpiredToken(t *testing.T) {
	mgr, _ := token.NewJWTManager(testSecret)

	// Generate already-expired token
	tokenString, _, _ := mgr.Generate(domain.AuthClaims{
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(-1 * time.Hour)),
		},
		Username: "expired",
	}, -1*time.Hour)

	_, err := mgr.Verify(tokenString)
	if err == nil {
		t.Fatal("expected verification to fail for expired token")
	}
}
