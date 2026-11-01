//go:build integration

package database_test

import (
	"context"
	"errors"
	"os"
	"strings"
	"testing"

	"tropical-fnb/backend/internal/platform/database"
)

func newManager(t *testing.T) (*database.TxManager, context.Context) {
	t.Helper()
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		t.Skip("DATABASE_URL not set")
	}
	ctx := context.Background()
	pool, err := database.NewPool(ctx, database.PoolConfig{URL: dsn, MaxConns: 4, MinConns: 0})
	if err != nil {
		t.Fatalf("NewPool: %v", err)
	}
	t.Cleanup(pool.Close)

	tm := database.NewTxManager(pool)
	// Isolated scratch table (TEMP tables are per-connection, so use a real one).
	if _, err := pool.Exec(ctx, `CREATE TABLE IF NOT EXISTS tx_probe (v text PRIMARY KEY)`); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `TRUNCATE tx_probe`); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _, _ = pool.Exec(context.Background(), `DROP TABLE IF EXISTS tx_probe`) })
	return tm, ctx
}

func count(t *testing.T, tm *database.TxManager, ctx context.Context) int {
	t.Helper()
	var n int
	if err := tm.Conn(ctx).QueryRow(ctx, `SELECT count(*) FROM tx_probe`).Scan(&n); err != nil {
		t.Fatal(err)
	}
	return n
}

func TestWithTx_CommitsOnSuccess(t *testing.T) {
	tm, ctx := newManager(t)
	err := tm.WithTx(ctx, func(ctx context.Context) error {
		if !database.InTx(ctx) {
			t.Error("context should carry a transaction")
		}
		_, err := tm.Conn(ctx).Exec(ctx, `INSERT INTO tx_probe VALUES ('a')`)
		return err
	})
	if err != nil {
		t.Fatal(err)
	}
	if got := count(t, tm, ctx); got != 1 {
		t.Fatalf("want 1 committed row, got %d", got)
	}
}

func TestWithTx_RollsBackOnError_AcrossMultipleStatements(t *testing.T) {
	tm, ctx := newManager(t)
	boom := errors.New("stock deduction failed")

	err := tm.WithTx(ctx, func(ctx context.Context) error {
		// Two "repositories" writing in the same transaction.
		if _, err := tm.Conn(ctx).Exec(ctx, `INSERT INTO tx_probe VALUES ('order-paid')`); err != nil {
			return err
		}
		if _, err := tm.Conn(ctx).Exec(ctx, `INSERT INTO tx_probe VALUES ('stock-deducted')`); err != nil {
			return err
		}
		return boom
	})
	if !errors.Is(err, boom) {
		t.Fatalf("expected original error to propagate, got %v", err)
	}
	if got := count(t, tm, ctx); got != 0 {
		t.Fatalf("rollback must undo ALL writes, found %d rows", got)
	}
}

func TestWithTx_RollsBackOnPanic(t *testing.T) {
	tm, ctx := newManager(t)
	func() {
		defer func() { _ = recover() }()
		_ = tm.WithTx(ctx, func(ctx context.Context) error {
			_, _ = tm.Conn(ctx).Exec(ctx, `INSERT INTO tx_probe VALUES ('p')`)
			panic("unexpected")
		})
	}()
	if got := count(t, tm, ctx); got != 0 {
		t.Fatalf("panic must roll back, found %d rows", got)
	}
}

func TestWithTx_NestedCallsJoinOuterTransaction(t *testing.T) {
	tm, ctx := newManager(t)
	boom := errors.New("outer fails after inner succeeded")

	err := tm.WithTx(ctx, func(ctx context.Context) error {
		inner := tm.WithTx(ctx, func(ctx context.Context) error {
			_, err := tm.Conn(ctx).Exec(ctx, `INSERT INTO tx_probe VALUES ('inner')`)
			return err
		})
		if inner != nil {
			return inner
		}
		return boom
	})
	if !errors.Is(err, boom) {
		t.Fatalf("want outer error, got %v", err)
	}
	if got := count(t, tm, ctx); got != 0 {
		t.Fatalf("inner work must roll back with the outer transaction, found %d rows", got)
	}
}

func TestNewPool_ErrorDoesNotLeakCredentials(t *testing.T) {
	_, err := database.NewPool(context.Background(), database.PoolConfig{
		URL: "postgres://admin:SuperSecret@127.0.0.1:1/db?sslmode=disable&connect_timeout=1", MaxConns: 1,
	})
	if err == nil {
		t.Fatal("expected a connection error")
	}
	if msg := err.Error(); strings.Contains(msg, "SuperSecret") {
		t.Fatalf("error leaks the password: %v", err)
	}
}
