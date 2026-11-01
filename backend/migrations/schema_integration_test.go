//go:build integration

// Integration tests for the database schema. They need a reachable PostgreSQL
// (DATABASE_URL, any database on the server). Each test run creates a throw-away
// database, applies every migration, asserts the invariants below and drops it.
//
//	make test-integration
package migrations_test

import (
	"context"
	"errors"
	"fmt"
	"net/url"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/stdlib"
	"github.com/pressly/goose/v3"

	"tropical-fnb/backend/migrations"
)

// newTestDB creates an empty database, runs all migrations and returns an open
// connection plus a cleanup func.
func newTestDB(t *testing.T) (*pgx.Conn, *goose.Provider) {
	t.Helper()
	adminDSN := os.Getenv("DATABASE_URL")
	if adminDSN == "" {
		t.Skip("DATABASE_URL not set")
	}
	ctx := context.Background()

	admin, err := pgx.Connect(ctx, adminDSN)
	if err != nil {
		t.Fatalf("connect admin: %v", err)
	}
	name := fmt.Sprintf("tfp_it_%d", time.Now().UnixNano())
	if _, err := admin.Exec(ctx, "CREATE DATABASE "+name); err != nil {
		t.Fatalf("create database: %v", err)
	}

	u, _ := url.Parse(adminDSN)
	u.Path = "/" + name
	testDSN := u.String()

	cfg, err := pgx.ParseConfig(testDSN)
	if err != nil {
		t.Fatal(err)
	}
	sqlDB := stdlib.OpenDB(*cfg)
	provider, err := goose.NewProvider(goose.DialectPostgres, sqlDB, migrations.FS)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := provider.Up(ctx); err != nil {
		t.Fatalf("migrate up: %v", err)
	}

	conn, err := pgx.Connect(ctx, testDSN)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		conn.Close(ctx)
		sqlDB.Close()
		_, _ = admin.Exec(ctx, "DROP DATABASE IF EXISTS "+name+" WITH (FORCE)")
		admin.Close(ctx)
	})
	return conn, provider
}

func mustExec(t *testing.T, c *pgx.Conn, sql string, args ...any) {
	t.Helper()
	if _, err := c.Exec(context.Background(), sql, args...); err != nil {
		t.Fatalf("exec failed: %v\nSQL: %s", err, sql)
	}
}

func mustScanUUID(t *testing.T, c *pgx.Conn, sql string, args ...any) string {
	t.Helper()
	var id string
	if err := c.QueryRow(context.Background(), sql, args...).Scan(&id); err != nil {
		t.Fatalf("query failed: %v\nSQL: %s", err, sql)
	}
	return id
}

// pgCode extracts the SQLSTATE of a PostgreSQL error ("" if not a PG error).
func pgCode(err error) string {
	var pe *pgconn.PgError
	if errors.As(err, &pe) {
		return pe.Code
	}
	return ""
}

func expectPgError(t *testing.T, err error, code, what string) {
	t.Helper()
	if err == nil {
		t.Fatalf("%s: expected SQLSTATE %s but the statement succeeded", what, code)
	}
	if got := pgCode(err); got != code {
		t.Fatalf("%s: expected SQLSTATE %s, got %q (%v)", what, code, got, err)
	}
}

const (
	fkViolation       = "23503"
	uniqueViolation   = "23505"
	checkViolation    = "23514"
	restrictViolation = "23001" // raised by forbid_mutation()
)

func seedTenantAndOutlet(t *testing.T, c *pgx.Conn, slug string) (tenantID, outletID string) {
	t.Helper()
	tenantID = mustScanUUID(t, c, `INSERT INTO tenants (slug, name) VALUES ($1, $2) RETURNING id`, slug, "Tenant "+slug)
	outletID = mustScanUUID(t, c,
		`INSERT INTO outlets (tenant_id, code, slug, name) VALUES ($1, 'MAIN', $2, 'Main') RETURNING id`,
		tenantID, slug+"-main")
	return
}

func TestMigrationsAreReversible(t *testing.T) {
	_, provider := newTestDB(t)
	ctx := context.Background()

	// Roll everything back, then forward again: proves every Down is correct.
	if _, err := provider.DownTo(ctx, 0); err != nil {
		t.Fatalf("down to 0: %v", err)
	}
	if _, err := provider.Up(ctx); err != nil {
		t.Fatalf("re-apply up: %v", err)
	}
}

func TestPrimaryKeysAreUUIDv7(t *testing.T) {
	c, _ := newTestDB(t)
	id := mustScanUUID(t, c, `INSERT INTO tenants (slug, name) VALUES ('t1', 'T1') RETURNING id`)
	// UUID version nibble is the first char of the 3rd group.
	if parts := strings.Split(id, "-"); len(parts) != 5 || parts[2][0] != '7' {
		t.Fatalf("expected a UUIDv7, got %s", id)
	}
}

func TestCompositeFKBlocksCrossTenantReferences(t *testing.T) {
	c, _ := newTestDB(t)
	tenantA, _ := seedTenantAndOutlet(t, c, "alpha")
	_, outletB := seedTenantAndOutlet(t, c, "beta")

	userA := mustScanUUID(t, c,
		`INSERT INTO users (tenant_id, username, full_name, password_hash) VALUES ($1,'kasir1','Kasir Satu','x') RETURNING id`, tenantA)
	roleA := mustScanUUID(t, c,
		`INSERT INTO roles (tenant_id, code, name) VALUES ($1,'CASHIER','Kasir') RETURNING id`, tenantA)

	// Tenant A's user must NOT be assignable to tenant B's outlet.
	_, err := c.Exec(context.Background(),
		`INSERT INTO user_role_assignments (tenant_id, user_id, role_id, outlet_id) VALUES ($1,$2,$3,$4)`,
		tenantA, userA, roleA, outletB)
	expectPgError(t, err, fkViolation, "assigning a user to another tenant's outlet")

	// An audit row must not reference another tenant's outlet either.
	_, err = c.Exec(context.Background(),
		`INSERT INTO audit_logs (tenant_id, outlet_id, action, entity_type) VALUES ($1,$2,'VOID','order')`,
		tenantA, outletB)
	expectPgError(t, err, fkViolation, "audit row pointing at another tenant's outlet")
}

func TestAuditLogsAreAppendOnly(t *testing.T) {
	c, _ := newTestDB(t)
	tenant, outlet := seedTenantAndOutlet(t, c, "gamma")
	mustExec(t, c, `INSERT INTO audit_logs (tenant_id, outlet_id, action, entity_type) VALUES ($1,$2,'MANUAL_DISCOUNT','order')`, tenant, outlet)

	ctx := context.Background()
	_, err := c.Exec(ctx, `UPDATE audit_logs SET action = 'TAMPERED'`)
	expectPgError(t, err, restrictViolation, "UPDATE audit_logs")
	_, err = c.Exec(ctx, `DELETE FROM audit_logs`)
	expectPgError(t, err, restrictViolation, "DELETE audit_logs")
	_, err = c.Exec(ctx, `TRUNCATE audit_logs`)
	expectPgError(t, err, restrictViolation, "TRUNCATE audit_logs")

	var n int
	if err := c.QueryRow(ctx, `SELECT count(*) FROM audit_logs`).Scan(&n); err != nil || n != 1 {
		t.Fatalf("audit row must survive tampering attempts, count=%d err=%v", n, err)
	}
}

func TestOutletRules(t *testing.T) {
	c, _ := newTestDB(t)
	tenant, _ := seedTenantAndOutlet(t, c, "delta")
	ctx := context.Background()

	t.Run("outlet code unique per tenant, case-insensitive", func(t *testing.T) {
		_, err := c.Exec(ctx, `INSERT INTO outlets (tenant_id, code, slug, name) VALUES ($1,'main','delta-other','Dup')`, tenant)
		expectPgError(t, err, uniqueViolation, "duplicate outlet code")
	})
	t.Run("outlet slug is globally unique (public QR URL)", func(t *testing.T) {
		other := mustScanUUID(t, c, `INSERT INTO tenants (slug, name) VALUES ('epsilon','E') RETURNING id`)
		_, err := c.Exec(ctx, `INSERT INTO outlets (tenant_id, code, slug, name) VALUES ($1,'X','delta-main','Clash')`, other)
		expectPgError(t, err, uniqueViolation, "duplicate outlet slug across tenants")
	})
	t.Run("tax percentage bounded 0..100", func(t *testing.T) {
		_, err := c.Exec(ctx, `INSERT INTO outlets (tenant_id, code, slug, name, tax_pb1_percent) VALUES ($1,'BAD','delta-bad','Bad',150)`, tenant)
		expectPgError(t, err, checkViolation, "tax > 100")
	})
	t.Run("latitude and longitude come as a pair", func(t *testing.T) {
		_, err := c.Exec(ctx, `INSERT INTO outlets (tenant_id, code, slug, name, latitude) VALUES ($1,'GEO','delta-geo','Geo',-7.3)`, tenant)
		expectPgError(t, err, checkViolation, "latitude without longitude")
	})
	t.Run("slug format enforced", func(t *testing.T) {
		_, err := c.Exec(ctx, `INSERT INTO outlets (tenant_id, code, slug, name) VALUES ($1,'SLG','Not A Slug','Slug')`, tenant)
		expectPgError(t, err, checkViolation, "invalid slug")
	})
}

func TestUserAndRoleAssignmentRules(t *testing.T) {
	c, _ := newTestDB(t)
	tenant, outlet := seedTenantAndOutlet(t, c, "zeta")
	ctx := context.Background()

	user := mustScanUUID(t, c,
		`INSERT INTO users (tenant_id, username, full_name, email, password_hash) VALUES ($1,'owner','Pemilik','Owner@Example.com','x') RETURNING id`, tenant)
	role := mustScanUUID(t, c, `INSERT INTO roles (tenant_id, code, name) VALUES ($1,'OWNER','Owner') RETURNING id`, tenant)

	t.Run("username unique per tenant", func(t *testing.T) {
		_, err := c.Exec(ctx, `INSERT INTO users (tenant_id, username, full_name, password_hash) VALUES ($1,'owner','Dup','x')`, tenant)
		expectPgError(t, err, uniqueViolation, "duplicate username")
	})
	t.Run("email unique ignoring case", func(t *testing.T) {
		_, err := c.Exec(ctx, `INSERT INTO users (tenant_id, username, full_name, email, password_hash) VALUES ($1,'owner2','Dup','owner@example.com','x')`, tenant)
		expectPgError(t, err, uniqueViolation, "duplicate email with different case")
	})
	t.Run("soft-deleted username can be reused", func(t *testing.T) {
		mustExec(t, c, `UPDATE users SET deleted_at = now() WHERE id = $1`, user)
		mustExec(t, c, `INSERT INTO users (tenant_id, username, full_name, password_hash) VALUES ($1,'owner','Pemilik Baru','x')`, tenant)
	})
	t.Run("same role cannot be granted twice for 'all outlets' (NULL outlet)", func(t *testing.T) {
		u2 := mustScanUUID(t, c, `INSERT INTO users (tenant_id, username, full_name, password_hash) VALUES ($1,'boss','Boss','x') RETURNING id`, tenant)
		mustExec(t, c, `INSERT INTO user_role_assignments (tenant_id, user_id, role_id, outlet_id) VALUES ($1,$2,$3,NULL)`, tenant, u2, role)
		_, err := c.Exec(ctx, `INSERT INTO user_role_assignments (tenant_id, user_id, role_id, outlet_id) VALUES ($1,$2,$3,NULL)`, tenant, u2, role)
		expectPgError(t, err, uniqueViolation, "duplicate NULL-outlet assignment")
		// A per-outlet grant of the same role is a different, valid row.
		mustExec(t, c, `INSERT INTO user_role_assignments (tenant_id, user_id, role_id, outlet_id) VALUES ($1,$2,$3,$4)`, tenant, u2, role, outlet)
	})
}

func TestUpdatedAtTriggerAdvances(t *testing.T) {
	c, _ := newTestDB(t)
	ctx := context.Background()
	id := mustScanUUID(t, c, `INSERT INTO tenants (slug, name) VALUES ('eta','Eta') RETURNING id`)

	var before, after time.Time
	if err := c.QueryRow(ctx, `SELECT updated_at FROM tenants WHERE id=$1`, id).Scan(&before); err != nil {
		t.Fatal(err)
	}
	time.Sleep(20 * time.Millisecond)
	mustExec(t, c, `UPDATE tenants SET name='Eta 2' WHERE id=$1`, id)
	if err := c.QueryRow(ctx, `SELECT updated_at FROM tenants WHERE id=$1`, id).Scan(&after); err != nil {
		t.Fatal(err)
	}
	if !after.After(before) {
		t.Fatalf("updated_at did not advance: before=%v after=%v", before, after)
	}
}
