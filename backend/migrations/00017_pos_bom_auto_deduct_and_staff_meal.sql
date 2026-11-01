-- +goose Up
-- +goose StatementBegin

-- 1. Extend orders table with stock_deducted idempotency flag
ALTER TABLE orders
    ADD COLUMN IF NOT EXISTS stock_deducted BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS stock_deducted_at TIMESTAMPTZ DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_stock_deducted ON orders (tenant_id, stock_deducted);

-- 2. Extend waste_records table with recipient division and expand category length for custom reasons
ALTER TABLE waste_records
    ALTER COLUMN category TYPE VARCHAR(64);

ALTER TABLE waste_records
    ADD COLUMN IF NOT EXISTS recipient_division VARCHAR(64) DEFAULT NULL;

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin

ALTER TABLE waste_records
    DROP COLUMN IF EXISTS recipient_division;

DROP INDEX IF EXISTS idx_orders_stock_deducted;

ALTER TABLE orders
    DROP COLUMN IF EXISTS stock_deducted_at,
    DROP COLUMN IF EXISTS stock_deducted;

-- +goose StatementEnd
