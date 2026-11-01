// Package database wires PostgreSQL (pgx v5) and provides the transaction
// manager that lets a use case span several repositories in ONE ACID
// transaction, e.g. "pay order -> deduct stock -> record cash".
package database

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

// DBTX is the subset of pgx shared by *pgxpool.Pool and pgx.Tx. Repositories
// depend on this interface and obtain it via TxManager.Conn so they work both
// inside and outside a transaction without knowing which.
type DBTX interface {
	Exec(ctx context.Context, sql string, args ...any) (pgconn.CommandTag, error)
	Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error)
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
}

// PoolConfig are the tunables for the connection pool.
type PoolConfig struct {
	URL      string
	MaxConns int32
	MinConns int32
}

// NewPool creates the pgx pool and verifies connectivity.
func NewPool(ctx context.Context, c PoolConfig) (*pgxpool.Pool, error) {
	pc, err := pgxpool.ParseConfig(c.URL)
	if err != nil {
		// pgx error text may echo parts of the DSN; do not wrap it verbatim.
		return nil, errors.New("database: DATABASE_URL could not be parsed")
	}
	pc.MaxConns = c.MaxConns
	pc.MinConns = c.MinConns
	pc.MaxConnLifetime = 30 * time.Minute
	pc.MaxConnIdleTime = 5 * time.Minute
	pc.HealthCheckPeriod = 30 * time.Second
	// Money/quantity math must be deterministic regardless of server locale.
	pc.ConnConfig.RuntimeParams["timezone"] = "UTC"

	pool, err := pgxpool.NewWithConfig(ctx, pc)
	if err != nil {
		return nil, fmt.Errorf("database: create pool: %w", err)
	}

	pingCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	if err := pool.Ping(pingCtx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("database: ping: %w", err)
	}
	return pool, nil
}

type txKey struct{}

// TxManager runs functions inside database transactions and exposes the
// "current connection" (transaction if one is active, pool otherwise).
type TxManager struct {
	pool *pgxpool.Pool
}

// NewTxManager returns a TxManager backed by pool.
func NewTxManager(pool *pgxpool.Pool) *TxManager { return &TxManager{pool: pool} }

// WithTx runs fn in a transaction. fn receives a context that carries the
// transaction; repositories calling Conn(ctx) with it join the same
// transaction. The transaction commits if fn returns nil and rolls back on
// error or panic. Calling WithTx inside an active transaction simply joins it
// (no savepoints), so use cases compose safely.
func (m *TxManager) WithTx(ctx context.Context, fn func(ctx context.Context) error) error {
	if _, ok := ctx.Value(txKey{}).(pgx.Tx); ok {
		return fn(ctx)
	}
	return pgx.BeginFunc(ctx, m.pool, func(tx pgx.Tx) error {
		return fn(context.WithValue(ctx, txKey{}, tx))
	})
}

// Conn returns the active transaction from ctx, or the pool when there is none.
func (m *TxManager) Conn(ctx context.Context) DBTX {
	if tx, ok := ctx.Value(txKey{}).(pgx.Tx); ok {
		return tx
	}
	return m.pool
}

// InTx reports whether ctx carries an active transaction.
func InTx(ctx context.Context) bool {
	_, ok := ctx.Value(txKey{}).(pgx.Tx)
	return ok
}
