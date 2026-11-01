// Package token provides HMAC-SHA256 JWT generation and validation.
package token

import (
	"errors"
	"fmt"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"

	"tropical-fnb/backend/internal/modules/iam/domain"
)

// JWTManager implements domain.TokenManager using HMAC-SHA256.
type JWTManager struct {
	secret []byte
	issuer string
}

// NewJWTManager creates a new JWTManager.
func NewJWTManager(secret string) (*JWTManager, error) {
	if len(secret) < 32 {
		return nil, errors.New("jwt: secret must be at least 32 characters")
	}
	return &JWTManager{
		secret: []byte(secret),
		issuer: "tropical-fnb-platform",
	}, nil
}

// Generate issues a signed JWT token with the given claims and expiry.
func (m *JWTManager) Generate(claims domain.AuthClaims, expiry time.Duration) (string, time.Time, error) {
	now := time.Now().UTC()
	expiresAt := now.Add(expiry)

	claims.Issuer = m.issuer
	claims.IssuedAt = jwt.NewNumericDate(now)
	claims.ExpiresAt = jwt.NewNumericDate(expiresAt)
	claims.NotBefore = jwt.NewNumericDate(now)
	claims.ID = uuid.NewString()

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	tokenString, err := token.SignedString(m.secret)
	if err != nil {
		return "", time.Time{}, fmt.Errorf("jwt: sign token: %w", err)
	}

	return tokenString, expiresAt, nil
}

// Verify validates the token signature, issuer, and expiration, returning parsed claims.
func (m *JWTManager) Verify(tokenString string) (*domain.AuthClaims, error) {
	token, err := jwt.ParseWithClaims(tokenString, &domain.AuthClaims{}, func(t *jwt.Token) (any, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", t.Header["alg"])
		}
		return m.secret, nil
	}, jwt.WithIssuer(m.issuer))

	if err != nil {
		return nil, fmt.Errorf("jwt: invalid token: %w", err)
	}

	claims, ok := token.Claims.(*domain.AuthClaims)
	if !ok || !token.Valid {
		return nil, errors.New("jwt: invalid token claims")
	}

	return claims, nil
}
