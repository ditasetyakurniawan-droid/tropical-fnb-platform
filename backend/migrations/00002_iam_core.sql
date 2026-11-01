-- +goose Up

-- ============================================================================
-- Module: iam  (tenants, outlets, roles/permissions, users, audit trail)
-- ============================================================================
-- Tenant isolation strategy: every business table carries tenant_id and (where
-- relevant) outlet_id. Child tables reference parents through COMPOSITE foreign
-- keys (tenant_id, id) so the database itself refuses a row that points at a
-- parent belonging to a different tenant.

-- ---------------------------------------------------------------- tenants --
CREATE TABLE tenants (
    id         uuid        PRIMARY KEY DEFAULT uuidv7(),
    slug       text        NOT NULL,
    name       text        NOT NULL,
    timezone   text        NOT NULL DEFAULT 'Asia/Jakarta',
    currency   char(3)     NOT NULL DEFAULT 'IDR',
    settings   jsonb       NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz,
    CONSTRAINT tenants_slug_format CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
    CONSTRAINT tenants_name_not_blank CHECK (btrim(name) <> '')
);
CREATE UNIQUE INDEX tenants_slug_uq ON tenants (slug) WHERE deleted_at IS NULL;
CREATE TRIGGER tenants_set_updated_at BEFORE UPDATE ON tenants
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------- outlets --
-- One row per physical restaurant / branch / central kitchen
-- (e.g. "Tropical Steak House", "Tropical Garden Resto").
CREATE TABLE outlets (
    id                     uuid         PRIMARY KEY DEFAULT uuidv7(),
    tenant_id              uuid         NOT NULL REFERENCES tenants (id),
    code                   text         NOT NULL,   -- short internal code, e.g. TSH-01
    slug                   text         NOT NULL,   -- public, used in QR URLs: /order/:slug/:table
    name                   text         NOT NULL,
    outlet_type            text         NOT NULL DEFAULT 'RESTAURANT',
    tax_pb1_percent        numeric(5,2) NOT NULL DEFAULT 10.00,
    service_charge_percent numeric(5,2) NOT NULL DEFAULT 0.00,
    address                text,
    latitude               numeric(9,6),
    longitude              numeric(9,6),
    geofence_radius_meters integer      NOT NULL DEFAULT 100,
    is_active              boolean      NOT NULL DEFAULT true,
    created_at             timestamptz  NOT NULL DEFAULT now(),
    updated_at             timestamptz  NOT NULL DEFAULT now(),
    deleted_at             timestamptz,
    CONSTRAINT outlets_tenant_id_id_uq UNIQUE (tenant_id, id),  -- target of composite FKs
    CONSTRAINT outlets_type_valid CHECK (outlet_type IN ('RESTAURANT', 'CENTRAL_KITCHEN')),
    CONSTRAINT outlets_pb1_range CHECK (tax_pb1_percent BETWEEN 0 AND 100),
    CONSTRAINT outlets_service_range CHECK (service_charge_percent BETWEEN 0 AND 100),
    CONSTRAINT outlets_geofence_positive CHECK (geofence_radius_meters > 0),
    CONSTRAINT outlets_lat_range CHECK (latitude  IS NULL OR latitude  BETWEEN  -90 AND  90),
    CONSTRAINT outlets_lng_range CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180),
    CONSTRAINT outlets_geo_pair CHECK ((latitude IS NULL) = (longitude IS NULL)),
    CONSTRAINT outlets_slug_format CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);
CREATE UNIQUE INDEX outlets_tenant_code_uq ON outlets (tenant_id, upper(code)) WHERE deleted_at IS NULL;
-- slug is global because the public QR URL carries only the outlet slug.
CREATE UNIQUE INDEX outlets_slug_uq ON outlets (slug) WHERE deleted_at IS NULL;
CREATE TRIGGER outlets_set_updated_at BEFORE UPDATE ON outlets
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ------------------------------------------------------------------ roles --
CREATE TABLE roles (
    id          uuid        PRIMARY KEY DEFAULT uuidv7(),
    tenant_id   uuid        NOT NULL REFERENCES tenants (id),
    code        text        NOT NULL,        -- OWNER, OUTLET_MANAGER, CASHIER, ...
    name        text        NOT NULL,
    description text,
    is_system   boolean     NOT NULL DEFAULT false,  -- system roles cannot be deleted
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT roles_tenant_id_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT roles_tenant_code_uq UNIQUE (tenant_id, code),
    CONSTRAINT roles_code_format CHECK (code ~ '^[A-Z][A-Z0-9_]*$')
);
CREATE TRIGGER roles_set_updated_at BEFORE UPDATE ON roles
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Global permission catalogue. Each module registers its own permission codes
-- (e.g. 'pos.order.void') through its own migrations/seed.
CREATE TABLE permissions (
    code        text PRIMARY KEY,
    module      text NOT NULL,
    description text NOT NULL,
    CONSTRAINT permissions_code_format CHECK (code ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$')
);

CREATE TABLE role_permissions (
    role_id         uuid NOT NULL REFERENCES roles (id) ON DELETE CASCADE,
    permission_code text NOT NULL REFERENCES permissions (code) ON DELETE CASCADE,
    PRIMARY KEY (role_id, permission_code)
);
CREATE INDEX role_permissions_permission_idx ON role_permissions (permission_code);

-- ------------------------------------------------------------------ users --
CREATE TABLE users (
    id                  uuid        PRIMARY KEY DEFAULT uuidv7(),
    tenant_id           uuid        NOT NULL REFERENCES tenants (id),
    username            text        NOT NULL,
    full_name           text        NOT NULL,
    email               text,
    phone               text,
    password_hash       text        NOT NULL,
    supervisor_pin_hash text,        -- hashed PIN used to authorise void/discount at the POS
    is_active           boolean     NOT NULL DEFAULT true,
    last_login_at       timestamptz,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    deleted_at          timestamptz,
    CONSTRAINT users_tenant_id_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT users_username_format CHECK (username ~ '^[a-z0-9._-]{3,50}$'),
    CONSTRAINT users_full_name_not_blank CHECK (btrim(full_name) <> '')
);
CREATE UNIQUE INDEX users_tenant_username_uq ON users (tenant_id, username) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX users_tenant_email_uq ON users (tenant_id, lower(email))
    WHERE email IS NOT NULL AND deleted_at IS NULL;
CREATE TRIGGER users_set_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- A user can hold different roles in different outlets. outlet_id = NULL means
-- "all outlets of the tenant" (e.g. the Owner, or head-office Finance).
CREATE TABLE user_role_assignments (
    id         uuid        PRIMARY KEY DEFAULT uuidv7(),
    tenant_id  uuid        NOT NULL,
    user_id    uuid        NOT NULL,
    role_id    uuid        NOT NULL,
    outlet_id  uuid,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ura_user_fk   FOREIGN KEY (tenant_id, user_id)   REFERENCES users   (tenant_id, id) ON DELETE CASCADE,
    CONSTRAINT ura_role_fk   FOREIGN KEY (tenant_id, role_id)   REFERENCES roles   (tenant_id, id),
    CONSTRAINT ura_outlet_fk FOREIGN KEY (tenant_id, outlet_id) REFERENCES outlets (tenant_id, id),
    CONSTRAINT ura_unique UNIQUE NULLS NOT DISTINCT (user_id, role_id, outlet_id)
);
CREATE INDEX ura_role_idx   ON user_role_assignments (tenant_id, role_id);
CREATE INDEX ura_outlet_idx ON user_role_assignments (tenant_id, outlet_id);

-- ------------------------------------------------------------- audit_logs --
-- Append-only trail for sensitive actions (void, manual discount, stock
-- adjustment, payroll approval, ...). approver_user_id records the supervisor
-- who authorised the action with their PIN.
CREATE TABLE audit_logs (
    id               uuid        PRIMARY KEY DEFAULT uuidv7(),
    tenant_id        uuid        NOT NULL,
    outlet_id        uuid,
    actor_user_id    uuid,
    approver_user_id uuid,
    action           text        NOT NULL,
    entity_type      text        NOT NULL,
    entity_id        uuid,
    before_json      jsonb,
    after_json       jsonb,
    ip_address       inet,
    user_agent       text,
    request_id       text,
    created_at       timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT audit_tenant_fk   FOREIGN KEY (tenant_id)                REFERENCES tenants (id),
    CONSTRAINT audit_outlet_fk   FOREIGN KEY (tenant_id, outlet_id)     REFERENCES outlets (tenant_id, id),
    CONSTRAINT audit_actor_fk    FOREIGN KEY (tenant_id, actor_user_id) REFERENCES users   (tenant_id, id),
    CONSTRAINT audit_approver_fk FOREIGN KEY (tenant_id, approver_user_id) REFERENCES users (tenant_id, id),
    CONSTRAINT audit_action_not_blank CHECK (btrim(action) <> '')
);
CREATE INDEX audit_logs_tenant_time_idx   ON audit_logs (tenant_id, created_at DESC);
CREATE INDEX audit_logs_entity_idx        ON audit_logs (tenant_id, entity_type, entity_id);
CREATE INDEX audit_logs_actor_time_idx    ON audit_logs (tenant_id, actor_user_id, created_at DESC);

CREATE TRIGGER audit_logs_no_update_delete BEFORE UPDATE OR DELETE ON audit_logs
    FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
CREATE TRIGGER audit_logs_no_truncate BEFORE TRUNCATE ON audit_logs
    FOR EACH STATEMENT EXECUTE FUNCTION forbid_mutation();

-- +goose Down
DROP TABLE IF EXISTS audit_logs;
DROP TABLE IF EXISTS user_role_assignments;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS role_permissions;
DROP TABLE IF EXISTS permissions;
DROP TABLE IF EXISTS roles;
DROP TABLE IF EXISTS outlets;
DROP TABLE IF EXISTS tenants;
