-- +goose Up
-- ============================================================================
-- Milestone 5: HR & Payroll (employees, attendance, kasbon, payroll runs).
--
-- Conventions (docs/adr/0003 + docs/adr/0005):
--   * Money is NUMERIC(18,2) but payroll only ever stores WHOLE Rupiah; every
--     amount column has a CHECK that it has no fractional part.
--   * Rates are basis points (integer), never NUMERIC percentages.
--   * Every table carries tenant_id + outlet_id; children use composite FKs so
--     the database itself rejects cross-tenant / cross-outlet references.
--   * Tropical Steak House and Tropical Garden Resto are separate outlets with
--     separate employees, policies and payroll runs.
-- ============================================================================

-- ------------------------------------------------------------ permissions --
INSERT INTO permissions (code, module, description) VALUES
    ('hr.employee.manage',   'hr_payroll', 'Menambah dan mengubah data karyawan serta komponen gaji'),
    ('hr.attendance.manage', 'hr_payroll', 'Mengoreksi absensi manual dan menyetujui lembur'),
    ('hr.payroll.manage',    'hr_payroll', 'Menyusun (generate) draft penggajian dan kebijakan payroll'),
    ('hr.payroll.approve',   'hr_payroll', 'Menyetujui dan menandai penggajian dibayar (pemisahan tugas)')
ON CONFLICT (code) DO NOTHING;

-- ---------------------------------------------------------- payroll policy --
-- One row per outlet. Every business parameter lives here, never in code.
CREATE TABLE payroll_policies (
    id          uuid        PRIMARY KEY DEFAULT uuidv7(),
    tenant_id   uuid        NOT NULL,
    outlet_id   uuid        NOT NULL,

    pay_day                       smallint NOT NULL DEFAULT 5,
    working_days_basis            smallint NOT NULL DEFAULT 26,
    late_grace_minutes            smallint NOT NULL DEFAULT 10,
    late_deduction_per_minute     numeric(18,2) NOT NULL DEFAULT 0,
    overtime_divisor              smallint NOT NULL DEFAULT 173,

    bpjs_kes_employee_bps         smallint NOT NULL DEFAULT 100,
    bpjs_kes_employer_bps         smallint NOT NULL DEFAULT 400,
    bpjs_kes_wage_cap             numeric(18,2) NOT NULL DEFAULT 12000000,
    bpjs_jht_employee_bps         smallint NOT NULL DEFAULT 200,
    bpjs_jht_employer_bps         smallint NOT NULL DEFAULT 370,
    bpjs_jp_employee_bps          smallint NOT NULL DEFAULT 100,
    bpjs_jp_employer_bps          smallint NOT NULL DEFAULT 200,
    bpjs_jp_wage_cap              numeric(18,2) NOT NULL DEFAULT 10547400,
    bpjs_jkk_employer_bps         smallint NOT NULL DEFAULT 24,
    bpjs_jkm_employer_bps         smallint NOT NULL DEFAULT 30,

    -- Share of collected service charge that goes into the employee pool.
    service_charge_employee_share_bps smallint NOT NULL DEFAULT 10000,

    -- Clock-in must be inside the outlet geofence. The owner may switch this off
    -- (e.g. for local testing); every change is written to audit_logs.
    require_geofence              boolean NOT NULL DEFAULT true,

    -- false until the owner/accountant saves the policy once: the UI shows a
    -- warning banner so seeded sample values are never mistaken for real ones.
    is_reviewed                   boolean NOT NULL DEFAULT false,

    updated_by  uuid,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT payroll_policies_outlet_fk FOREIGN KEY (tenant_id, outlet_id) REFERENCES outlets (tenant_id, id),
    CONSTRAINT payroll_policies_outlet_uq UNIQUE (tenant_id, outlet_id),
    CONSTRAINT pp_pay_day_range     CHECK (pay_day BETWEEN 1 AND 28),
    CONSTRAINT pp_working_days      CHECK (working_days_basis BETWEEN 20 AND 31),
    CONSTRAINT pp_grace_range       CHECK (late_grace_minutes BETWEEN 0 AND 120),
    CONSTRAINT pp_late_rate         CHECK (late_deduction_per_minute >= 0 AND late_deduction_per_minute = trunc(late_deduction_per_minute)),
    CONSTRAINT pp_ot_divisor        CHECK (overtime_divisor BETWEEN 1 AND 400),
    CONSTRAINT pp_bps_range         CHECK (
        bpjs_kes_employee_bps BETWEEN 0 AND 10000 AND bpjs_kes_employer_bps BETWEEN 0 AND 10000 AND
        bpjs_jht_employee_bps BETWEEN 0 AND 10000 AND bpjs_jht_employer_bps BETWEEN 0 AND 10000 AND
        bpjs_jp_employee_bps  BETWEEN 0 AND 10000 AND bpjs_jp_employer_bps  BETWEEN 0 AND 10000 AND
        bpjs_jkk_employer_bps BETWEEN 0 AND 10000 AND bpjs_jkm_employer_bps BETWEEN 0 AND 10000 AND
        service_charge_employee_share_bps BETWEEN 0 AND 10000),
    CONSTRAINT pp_caps_whole        CHECK (bpjs_kes_wage_cap >= 0 AND bpjs_kes_wage_cap = trunc(bpjs_kes_wage_cap)
                                       AND bpjs_jp_wage_cap  >= 0 AND bpjs_jp_wage_cap  = trunc(bpjs_jp_wage_cap))
);
CREATE TRIGGER payroll_policies_set_updated_at BEFORE UPDATE ON payroll_policies
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ------------------------------------------------------------------ shifts --
CREATE TABLE shift_definitions (
    id          uuid        PRIMARY KEY DEFAULT uuidv7(),
    tenant_id   uuid        NOT NULL,
    outlet_id   uuid        NOT NULL,
    code        text        NOT NULL,
    name        text        NOT NULL,
    start_time  time        NOT NULL,
    end_time    time        NOT NULL,   -- may be earlier than start_time for shifts crossing midnight
    is_active   boolean     NOT NULL DEFAULT true,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT shift_outlet_fk FOREIGN KEY (tenant_id, outlet_id) REFERENCES outlets (tenant_id, id),
    CONSTRAINT shift_tenant_id_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT shift_code_uq UNIQUE (tenant_id, outlet_id, code),
    CONSTRAINT shift_code_format CHECK (code ~ '^[A-Z][A-Z0-9_]*$'),
    CONSTRAINT shift_times_differ CHECK (start_time <> end_time)
);
CREATE TRIGGER shift_definitions_set_updated_at BEFORE UPDATE ON shift_definitions
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- --------------------------------------------------------------- employees --
CREATE TABLE employees (
    id                    uuid        PRIMARY KEY DEFAULT uuidv7(),
    tenant_id             uuid        NOT NULL,
    outlet_id             uuid        NOT NULL,   -- home outlet: who pays this person
    user_id               uuid,                   -- optional login (needed for self clock-in)
    employee_code         text        NOT NULL,
    full_name             text        NOT NULL,
    position_title        text        NOT NULL,
    employment_status     text        NOT NULL DEFAULT 'PERMANENT',
    join_date             date        NOT NULL,
    resign_date           date,
    base_salary           numeric(18,2) NOT NULL,
    position_allowance    numeric(18,2) NOT NULL DEFAULT 0,
    meal_allowance_per_day numeric(18,2) NOT NULL DEFAULT 0,
    bpjs_enrolled         boolean     NOT NULL DEFAULT true,
    -- Service-charge weight in hundredths (100 = 1.00 point). Share of the pool
    -- is proportional to points x days physically present.
    service_charge_points integer     NOT NULL DEFAULT 100,
    default_shift_id      uuid,
    bank_name             text,
    bank_account          text,
    is_active             boolean     NOT NULL DEFAULT true,
    notes                 text,
    created_at            timestamptz NOT NULL DEFAULT now(),
    updated_at            timestamptz NOT NULL DEFAULT now(),
    deleted_at            timestamptz,
    CONSTRAINT employees_outlet_fk  FOREIGN KEY (tenant_id, outlet_id)       REFERENCES outlets (tenant_id, id),
    CONSTRAINT employees_user_fk    FOREIGN KEY (tenant_id, user_id)         REFERENCES users (tenant_id, id),
    CONSTRAINT employees_shift_fk   FOREIGN KEY (tenant_id, default_shift_id) REFERENCES shift_definitions (tenant_id, id),
    CONSTRAINT employees_tenant_id_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT employees_status CHECK (employment_status IN ('PERMANENT', 'CONTRACT', 'PROBATION')),
    CONSTRAINT employees_name_not_blank CHECK (btrim(full_name) <> ''),
    CONSTRAINT employees_code_format CHECK (employee_code ~ '^[A-Z0-9][A-Z0-9-]*$'),
    CONSTRAINT employees_base_whole CHECK (base_salary >= 0 AND base_salary = trunc(base_salary)),
    CONSTRAINT employees_allow_whole CHECK (position_allowance >= 0 AND position_allowance = trunc(position_allowance)),
    CONSTRAINT employees_meal_whole CHECK (meal_allowance_per_day >= 0 AND meal_allowance_per_day = trunc(meal_allowance_per_day)),
    CONSTRAINT employees_points_range CHECK (service_charge_points BETWEEN 0 AND 100000),
    CONSTRAINT employees_resign_after_join CHECK (resign_date IS NULL OR resign_date >= join_date)
);
CREATE UNIQUE INDEX employees_code_uq ON employees (tenant_id, outlet_id, employee_code) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX employees_user_uq ON employees (tenant_id, user_id) WHERE user_id IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX employees_outlet_idx ON employees (tenant_id, outlet_id) WHERE deleted_at IS NULL;
CREATE TRIGGER employees_set_updated_at BEFORE UPDATE ON employees
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- -------------------------------------------------------------- attendance --
CREATE TABLE attendance_records (
    id                   uuid        PRIMARY KEY DEFAULT uuidv7(),
    tenant_id            uuid        NOT NULL,
    outlet_id            uuid        NOT NULL,
    employee_id          uuid        NOT NULL,
    work_date            date        NOT NULL,
    shift_id             uuid,
    status               text        NOT NULL,
    clock_in             timestamptz,
    clock_out            timestamptz,
    late_minutes         integer     NOT NULL DEFAULT 0,
    overtime_minutes     integer     NOT NULL DEFAULT 0,
    overtime_approved    boolean     NOT NULL DEFAULT false,
    overtime_approved_by uuid,
    source               text        NOT NULL DEFAULT 'MANUAL',
    clock_in_lat         numeric(9,6),
    clock_in_lng         numeric(9,6),
    clock_in_distance_m  integer,
    notes                text,
    created_by           uuid,
    created_at           timestamptz NOT NULL DEFAULT now(),
    updated_at           timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT att_employee_fk FOREIGN KEY (tenant_id, employee_id) REFERENCES employees (tenant_id, id),
    CONSTRAINT att_outlet_fk   FOREIGN KEY (tenant_id, outlet_id)   REFERENCES outlets (tenant_id, id),
    CONSTRAINT att_shift_fk    FOREIGN KEY (tenant_id, shift_id)    REFERENCES shift_definitions (tenant_id, id),
    CONSTRAINT att_status  CHECK (status IN ('PRESENT', 'LATE', 'ABSENT', 'LEAVE', 'SICK', 'OFF')),
    CONSTRAINT att_source  CHECK (source IN ('GEOFENCE', 'MANUAL')),
    CONSTRAINT att_late_nonneg CHECK (late_minutes >= 0 AND overtime_minutes >= 0),
    -- Only physically present days may carry late/overtime minutes.
    CONSTRAINT att_minutes_need_presence CHECK (
        status IN ('PRESENT', 'LATE') OR (late_minutes = 0 AND overtime_minutes = 0)),
    CONSTRAINT att_clock_order CHECK (clock_out IS NULL OR clock_in IS NULL OR clock_out >= clock_in),
    CONSTRAINT att_one_per_day UNIQUE (employee_id, work_date)
);
CREATE INDEX att_outlet_date_idx ON attendance_records (tenant_id, outlet_id, work_date);
CREATE TRIGGER attendance_records_set_updated_at BEFORE UPDATE ON attendance_records
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ------------------------------------------------------------------ kasbon --
CREATE TABLE employee_advances (
    id                 uuid        PRIMARY KEY DEFAULT uuidv7(),
    tenant_id          uuid        NOT NULL,
    outlet_id          uuid        NOT NULL,
    employee_id        uuid        NOT NULL,
    amount             numeric(18,2) NOT NULL,
    installment_amount numeric(18,2) NOT NULL,
    remaining_balance  numeric(18,2) NOT NULL,
    status             text        NOT NULL DEFAULT 'ACTIVE',
    issued_on          date        NOT NULL,
    reason             text,
    created_by         uuid,
    created_at         timestamptz NOT NULL DEFAULT now(),
    updated_at         timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT adv_employee_fk FOREIGN KEY (tenant_id, employee_id) REFERENCES employees (tenant_id, id),
    CONSTRAINT adv_outlet_fk   FOREIGN KEY (tenant_id, outlet_id)   REFERENCES outlets (tenant_id, id),
    CONSTRAINT adv_tenant_id_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT adv_status CHECK (status IN ('ACTIVE', 'PAID_OFF', 'CANCELLED')),
    CONSTRAINT adv_amount_whole CHECK (amount > 0 AND amount = trunc(amount)),
    CONSTRAINT adv_installment_whole CHECK (installment_amount > 0 AND installment_amount <= amount
                                            AND installment_amount = trunc(installment_amount)),
    CONSTRAINT adv_balance_range CHECK (remaining_balance >= 0 AND remaining_balance <= amount
                                        AND remaining_balance = trunc(remaining_balance)),
    CONSTRAINT adv_paid_off_consistent CHECK ((status = 'PAID_OFF') = (remaining_balance = 0) OR status = 'CANCELLED')
);
CREATE INDEX adv_employee_active_idx ON employee_advances (tenant_id, employee_id) WHERE status = 'ACTIVE';
CREATE TRIGGER employee_advances_set_updated_at BEFORE UPDATE ON employee_advances
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ------------------------------------------------------------ payroll runs --
CREATE TABLE payroll_runs (
    id                 uuid        PRIMARY KEY DEFAULT uuidv7(),
    tenant_id          uuid        NOT NULL,
    outlet_id          uuid        NOT NULL,
    period_year        smallint    NOT NULL,
    period_month       smallint    NOT NULL,
    period_start       date        NOT NULL,
    period_end         date        NOT NULL,
    pay_date           date        NOT NULL,
    status             text        NOT NULL DEFAULT 'DRAFT',

    service_charge_collected     numeric(18,2) NOT NULL DEFAULT 0,  -- sum of orders.service_charge_amount in the period
    service_charge_distributable numeric(18,2) NOT NULL DEFAULT 0,  -- collected x employee share
    service_charge_undistributed numeric(18,2) NOT NULL DEFAULT 0,  -- distributable that nobody could receive

    employee_count         integer       NOT NULL DEFAULT 0,
    total_gross            numeric(18,2) NOT NULL DEFAULT 0,
    total_deductions       numeric(18,2) NOT NULL DEFAULT 0,
    total_net              numeric(18,2) NOT NULL DEFAULT 0,
    total_employer_contribution numeric(18,2) NOT NULL DEFAULT 0,

    policy_snapshot    jsonb       NOT NULL DEFAULT '{}'::jsonb,
    generated_by       uuid,
    generated_at       timestamptz NOT NULL DEFAULT now(),
    approved_by        uuid,
    approved_at        timestamptz,
    paid_at            timestamptz,
    created_at         timestamptz NOT NULL DEFAULT now(),
    updated_at         timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT pr_outlet_fk FOREIGN KEY (tenant_id, outlet_id) REFERENCES outlets (tenant_id, id),
    CONSTRAINT pr_tenant_id_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT pr_status CHECK (status IN ('DRAFT', 'APPROVED', 'PAID', 'CANCELLED')),
    CONSTRAINT pr_month_range CHECK (period_month BETWEEN 1 AND 12),
    CONSTRAINT pr_period_order CHECK (period_end >= period_start),
    CONSTRAINT pr_approved_has_approver CHECK (status IN ('DRAFT', 'CANCELLED') OR (approved_by IS NOT NULL AND approved_at IS NOT NULL)),
    CONSTRAINT pr_paid_has_time CHECK (status <> 'PAID' OR paid_at IS NOT NULL),
    CONSTRAINT pr_totals_consistent CHECK (total_net = total_gross - total_deductions),
    CONSTRAINT pr_money_whole CHECK (
        service_charge_collected = trunc(service_charge_collected) AND
        service_charge_distributable = trunc(service_charge_distributable) AND
        service_charge_undistributed = trunc(service_charge_undistributed) AND
        total_gross = trunc(total_gross) AND total_deductions = trunc(total_deductions) AND
        total_net = trunc(total_net) AND total_employer_contribution = trunc(total_employer_contribution))
);
-- One live (non-cancelled) run per outlet per month.
CREATE UNIQUE INDEX payroll_runs_period_uq ON payroll_runs (tenant_id, outlet_id, period_year, period_month)
    WHERE status <> 'CANCELLED';
CREATE TRIGGER payroll_runs_set_updated_at BEFORE UPDATE ON payroll_runs
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ----------------------------------------------------------- payroll slips --
CREATE TABLE payroll_slips (
    id                  uuid        PRIMARY KEY DEFAULT uuidv7(),
    tenant_id           uuid        NOT NULL,
    outlet_id           uuid        NOT NULL,
    run_id              uuid        NOT NULL,
    employee_id         uuid        NOT NULL,

    -- Snapshot of who the employee was when the slip was generated.
    employee_code       text        NOT NULL,
    employee_name       text        NOT NULL,
    position_title      text        NOT NULL,

    -- Attendance snapshot
    days_present            integer NOT NULL DEFAULT 0,
    days_unexcused_absent   integer NOT NULL DEFAULT 0,
    late_minutes_raw        integer NOT NULL DEFAULT 0,
    late_minutes_effective  integer NOT NULL DEFAULT 0,
    overtime_minutes        integer NOT NULL DEFAULT 0,
    service_charge_points   integer NOT NULL DEFAULT 0,

    -- Earnings
    base_salary          numeric(18,2) NOT NULL DEFAULT 0,
    position_allowance   numeric(18,2) NOT NULL DEFAULT 0,
    meal_allowance       numeric(18,2) NOT NULL DEFAULT 0,
    overtime_pay         numeric(18,2) NOT NULL DEFAULT 0,
    service_charge_share numeric(18,2) NOT NULL DEFAULT 0,
    gross_pay            numeric(18,2) NOT NULL DEFAULT 0,

    -- Deductions
    late_deduction       numeric(18,2) NOT NULL DEFAULT 0,
    absence_deduction    numeric(18,2) NOT NULL DEFAULT 0,
    bpjs_kesehatan       numeric(18,2) NOT NULL DEFAULT 0,
    bpjs_jht             numeric(18,2) NOT NULL DEFAULT 0,
    bpjs_jp              numeric(18,2) NOT NULL DEFAULT 0,
    kasbon_deduction     numeric(18,2) NOT NULL DEFAULT 0,
    total_deductions     numeric(18,2) NOT NULL DEFAULT 0,

    net_pay              numeric(18,2) NOT NULL DEFAULT 0,

    -- Employer-side cost (informational, not deducted from the employee)
    employer_bpjs_kesehatan numeric(18,2) NOT NULL DEFAULT 0,
    employer_bpjs_jht       numeric(18,2) NOT NULL DEFAULT 0,
    employer_bpjs_jp        numeric(18,2) NOT NULL DEFAULT 0,
    employer_bpjs_jkk       numeric(18,2) NOT NULL DEFAULT 0,
    employer_bpjs_jkm       numeric(18,2) NOT NULL DEFAULT 0,
    employer_contribution   numeric(18,2) NOT NULL DEFAULT 0,

    warnings             jsonb       NOT NULL DEFAULT '[]'::jsonb,
    created_at           timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT slip_run_fk      FOREIGN KEY (tenant_id, run_id)      REFERENCES payroll_runs (tenant_id, id) ON DELETE CASCADE,
    CONSTRAINT slip_employee_fk FOREIGN KEY (tenant_id, employee_id) REFERENCES employees (tenant_id, id),
    CONSTRAINT slip_tenant_id_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT slip_one_per_employee UNIQUE (run_id, employee_id),
    -- The accounting identities are enforced by the database itself.
    CONSTRAINT slip_gross_identity CHECK (
        gross_pay = base_salary + position_allowance + meal_allowance + overtime_pay + service_charge_share),
    CONSTRAINT slip_deduction_identity CHECK (
        total_deductions = late_deduction + absence_deduction + bpjs_kesehatan + bpjs_jht + bpjs_jp + kasbon_deduction),
    CONSTRAINT slip_net_identity CHECK (net_pay = gross_pay - total_deductions),
    CONSTRAINT slip_employer_identity CHECK (
        employer_contribution = employer_bpjs_kesehatan + employer_bpjs_jht + employer_bpjs_jp +
                                employer_bpjs_jkk + employer_bpjs_jkm),
    CONSTRAINT slip_nonneg CHECK (
        base_salary >= 0 AND position_allowance >= 0 AND meal_allowance >= 0 AND overtime_pay >= 0 AND
        service_charge_share >= 0 AND late_deduction >= 0 AND absence_deduction >= 0 AND bpjs_kesehatan >= 0 AND
        bpjs_jht >= 0 AND bpjs_jp >= 0 AND kasbon_deduction >= 0),
    CONSTRAINT slip_money_whole CHECK (
        base_salary = trunc(base_salary) AND position_allowance = trunc(position_allowance) AND
        meal_allowance = trunc(meal_allowance) AND overtime_pay = trunc(overtime_pay) AND
        service_charge_share = trunc(service_charge_share) AND gross_pay = trunc(gross_pay) AND
        late_deduction = trunc(late_deduction) AND absence_deduction = trunc(absence_deduction) AND
        bpjs_kesehatan = trunc(bpjs_kesehatan) AND bpjs_jht = trunc(bpjs_jht) AND bpjs_jp = trunc(bpjs_jp) AND
        kasbon_deduction = trunc(kasbon_deduction) AND total_deductions = trunc(total_deductions) AND
        net_pay = trunc(net_pay) AND employer_contribution = trunc(employer_contribution))
);
CREATE INDEX slips_run_idx ON payroll_slips (tenant_id, run_id);
CREATE INDEX slips_employee_idx ON payroll_slips (tenant_id, employee_id);

-- Kasbon repayments are an append-only ledger written when a run is approved.
CREATE TABLE employee_advance_repayments (
    id          uuid        PRIMARY KEY DEFAULT uuidv7(),
    tenant_id   uuid        NOT NULL,
    advance_id  uuid        NOT NULL,
    slip_id     uuid        NOT NULL,
    amount      numeric(18,2) NOT NULL,
    created_at  timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT rep_advance_fk FOREIGN KEY (tenant_id, advance_id) REFERENCES employee_advances (tenant_id, id),
    CONSTRAINT rep_slip_fk    FOREIGN KEY (tenant_id, slip_id)    REFERENCES payroll_slips (tenant_id, id),
    CONSTRAINT rep_amount_whole CHECK (amount > 0 AND amount = trunc(amount))
);
CREATE INDEX rep_advance_idx ON employee_advance_repayments (tenant_id, advance_id);
CREATE TRIGGER employee_advance_repayments_no_update_delete BEFORE UPDATE OR DELETE ON employee_advance_repayments
    FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

-- A payroll run that is no longer a DRAFT is frozen: its slips can never change.
-- +goose StatementBegin
CREATE FUNCTION payroll_slips_guard_frozen() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    v_status text;
BEGIN
    SELECT status INTO v_status FROM payroll_runs
     WHERE tenant_id = COALESCE(NEW.tenant_id, OLD.tenant_id)
       AND id = COALESCE(NEW.run_id, OLD.run_id);
    IF v_status IS NOT NULL AND v_status <> 'DRAFT' THEN
        RAISE EXCEPTION 'payroll run is % and its slips are frozen', v_status
            USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN COALESCE(NEW, OLD);
END;
$$;
-- +goose StatementEnd
CREATE TRIGGER payroll_slips_frozen BEFORE INSERT OR UPDATE OR DELETE ON payroll_slips
    FOR EACH ROW EXECUTE FUNCTION payroll_slips_guard_frozen();

-- ============================================================================
-- Seed: SAMPLE DATA for Tropical Group. Every salary / rate below is a
-- placeholder for demonstration; it is flagged (policy.is_reviewed = false,
-- employee.notes = 'DATA CONTOH') and must be replaced by the owner in the UI.
-- ============================================================================
-- +goose StatementBegin
DO $$
DECLARE
    v_tenant   uuid;
    v_steak    uuid;
    v_garden   uuid;
    v_owner_r  uuid;
    v_mgr_r    uuid;
    v_pass     text := '$2b$10$2DB6wqO1NnBGR2RLi8JeouoaP4Eeeh7kEdXqFNbqZRFG/dUb6/JUO'; -- Password123!
BEGIN
    SELECT id INTO v_tenant FROM tenants WHERE slug = 'tropical-temanggung';
    IF v_tenant IS NULL THEN
        RETURN; -- empty database (e.g. integration tests): nothing to seed
    END IF;
    SELECT id INTO v_steak  FROM outlets WHERE tenant_id = v_tenant AND code = 'TSH-01';
    SELECT id INTO v_garden FROM outlets WHERE tenant_id = v_tenant AND code = 'TGR-01';
    SELECT id INTO v_owner_r FROM roles WHERE tenant_id = v_tenant AND code = 'OWNER';
    SELECT id INTO v_mgr_r   FROM roles WHERE tenant_id = v_tenant AND code = 'OUTLET_MANAGER';

    -- Permissions: owner gets everything new; manager prepares but cannot approve.
    INSERT INTO role_permissions (role_id, permission_code)
    SELECT v_owner_r, code FROM permissions WHERE module = 'hr_payroll'
    ON CONFLICT DO NOTHING;
    INSERT INTO role_permissions (role_id, permission_code) VALUES
        (v_mgr_r, 'hr.payroll.view'),
        (v_mgr_r, 'hr.employee.manage'),
        (v_mgr_r, 'hr.attendance.manage'),
        (v_mgr_r, 'hr.payroll.manage')
    ON CONFLICT DO NOTHING;

    -- One outlet manager per restaurant (none existed yet).
    INSERT INTO users (tenant_id, username, full_name, email, password_hash, is_active)
    VALUES (v_tenant, 'manager_steak', 'Hendra Kusuma (Manajer Steak)', 'manager.steak@tropicalfnb.local', v_pass, true)
    ON CONFLICT (tenant_id, username) WHERE deleted_at IS NULL DO NOTHING;
    INSERT INTO users (tenant_id, username, full_name, email, password_hash, is_active)
    VALUES (v_tenant, 'manager_garden', 'Sri Handayani (Manajer Garden)', 'manager.garden@tropicalfnb.local', v_pass, true)
    ON CONFLICT (tenant_id, username) WHERE deleted_at IS NULL DO NOTHING;
    INSERT INTO user_role_assignments (tenant_id, user_id, role_id, outlet_id)
    SELECT v_tenant, u.id, v_mgr_r, v_steak FROM users u WHERE u.tenant_id = v_tenant AND u.username = 'manager_steak'
    ON CONFLICT DO NOTHING;
    INSERT INTO user_role_assignments (tenant_id, user_id, role_id, outlet_id)
    SELECT v_tenant, u.id, v_mgr_r, v_garden FROM users u WHERE u.tenant_id = v_tenant AND u.username = 'manager_garden'
    ON CONFLICT DO NOTHING;

    -- Policies (one per outlet). is_reviewed stays false until the owner saves.
    INSERT INTO payroll_policies (tenant_id, outlet_id, late_deduction_per_minute)
    VALUES (v_tenant, v_steak, 1000), (v_tenant, v_garden, 1000)
    ON CONFLICT (tenant_id, outlet_id) DO NOTHING;

    -- Shifts (sample hours; identical for both restaurants until edited).
    INSERT INTO shift_definitions (tenant_id, outlet_id, code, name, start_time, end_time)
    SELECT v_tenant, o, s.code, s.name, s.st, s.en
      FROM (VALUES (v_steak), (v_garden)) AS outlets_v(o)
     CROSS JOIN (VALUES
        ('PAGI',   'Shift Pagi',   TIME '06:30', TIME '14:30'),
        ('MIDDLE', 'Shift Middle', TIME '10:00', TIME '18:00'),
        ('MALAM',  'Shift Malam',  TIME '13:00', TIME '21:00')
     ) AS s(code, name, st, en)
    ON CONFLICT (tenant_id, outlet_id, code) DO NOTHING;

    -- Employees: (outlet, code, name, title, username, base, allowance, meal, points, shift)
    INSERT INTO employees (tenant_id, outlet_id, user_id, employee_code, full_name, position_title, employment_status,
                           join_date, base_salary, position_allowance, meal_allowance_per_day, bpjs_enrolled,
                           service_charge_points, default_shift_id, notes)
    SELECT v_tenant, e.outlet_id, u.id, e.code, e.full_name, e.title, 'PERMANENT',
           DATE '2025-03-01', e.base, e.allowance, 25000, true, e.points, sh.id, 'DATA CONTOH'
      FROM (VALUES
        (v_steak,  'TSH-001', 'Hendra Kusuma',   'Manajer Restoran', 'manager_steak', 4500000, 800000, 200, 'PAGI'),
        (v_steak,  'TSH-002', 'Rian Pratama',    'Supervisor',       'spv_steak',     3000000, 400000, 150, 'PAGI'),
        (v_steak,  'TSH-003', 'Siti Rahma',      'Kasir',            'kasir_steak',   2500000, 200000, 120, 'MIDDLE'),
        (v_steak,  'TSH-004', 'Bagus Setiawan',  'Koki Grill',       NULL,            2800000, 300000, 150, 'PAGI'),
        (v_steak,  'TSH-005', 'Dimas Prasetyo',  'Pelayan',          NULL,            2400000,      0, 100, 'MIDDLE'),
        (v_steak,  'TSH-006', 'Putri Anggraini', 'Pelayan',          NULL,            2400000,      0, 100, 'MALAM'),
        (v_garden, 'TGR-001', 'Sri Handayani',   'Manajer Restoran', 'manager_garden',4500000, 800000, 200, 'PAGI'),
        (v_garden, 'TGR-002', 'Agus Wijaya',     'Supervisor',       'spv_garden',    3000000, 400000, 150, 'PAGI'),
        (v_garden, 'TGR-003', 'Dewi Lestari',    'Kasir',            'kasir_garden',  2500000, 200000, 120, 'MIDDLE'),
        (v_garden, 'TGR-004', 'Slamet Riyadi',   'Koki Nusantara',   NULL,            2800000, 300000, 150, 'PAGI'),
        (v_garden, 'TGR-005', 'Eko Wibowo',      'Pelayan',          NULL,            2400000,      0, 100, 'MIDDLE'),
        (v_garden, 'TGR-006', 'Wulan Sari',      'Pelayan',          NULL,            2400000,      0, 100, 'MALAM')
      ) AS e(outlet_id, code, full_name, title, username, base, allowance, points, shift_code)
      LEFT JOIN users u ON u.tenant_id = v_tenant AND u.username = e.username AND u.deleted_at IS NULL
      JOIN shift_definitions sh ON sh.tenant_id = v_tenant AND sh.outlet_id = e.outlet_id AND sh.code = e.shift_code
    ON CONFLICT DO NOTHING;

    -- Sample attendance for September 2026 (a finished month, so a payroll run can
    -- be generated and verified by hand). Deterministic rules, n = employee order
    -- inside the outlet:
    --   * weekly OFF day = ISO weekday ((n-1) mod 7)+1
    --   * n divisible by 5: ABSENT (unexcused) on 17 Sep
    --   * even n: LATE by 15 minutes on days 9, 18, 27
    --   * n divisible by 3: 90 approved overtime minutes on days 12 and 26
    --   * everything else PRESENT
    INSERT INTO attendance_records (tenant_id, outlet_id, employee_id, work_date, shift_id, status,
                                    clock_in, clock_out, late_minutes, overtime_minutes, overtime_approved, source, notes)
    SELECT v_tenant, x.outlet_id, x.employee_id, x.d, x.shift_id, x.status,
           CASE WHEN x.status IN ('PRESENT','LATE')
                THEN ((x.d + x.start_time) AT TIME ZONE 'Asia/Jakarta') + make_interval(mins => x.late_min) END,
           CASE WHEN x.status IN ('PRESENT','LATE')
                THEN ((x.d + x.end_time) AT TIME ZONE 'Asia/Jakarta') + make_interval(mins => x.ot_min) END,
           x.late_min, x.ot_min, x.ot_min > 0, 'MANUAL', 'DATA CONTOH'
      FROM (
        SELECT n.*, gs.d::date AS d,
               CASE
                 WHEN extract(isodow FROM gs.d) = ((n.n - 1) % 7) + 1 THEN 'OFF'
                 WHEN n.n % 5 = 0 AND gs.d::date = DATE '2026-09-17' THEN 'ABSENT'
                 WHEN n.n % 2 = 0 AND extract(day FROM gs.d) IN (9, 18, 27) THEN 'LATE'
                 ELSE 'PRESENT'
               END AS status
          FROM (
            SELECT e.id AS employee_id, e.outlet_id, e.default_shift_id AS shift_id,
                   sh.start_time, sh.end_time,
                   row_number() OVER (PARTITION BY e.outlet_id ORDER BY e.employee_code) AS n
              FROM employees e
              JOIN shift_definitions sh ON sh.id = e.default_shift_id
             WHERE e.tenant_id = v_tenant AND e.notes = 'DATA CONTOH'
          ) n
         CROSS JOIN generate_series(TIMESTAMP '2026-09-01', TIMESTAMP '2026-09-30', INTERVAL '1 day') AS gs(d)
      ) base
      CROSS JOIN LATERAL (
        SELECT base.*,
               CASE WHEN base.status = 'LATE' THEN 15 ELSE 0 END AS late_min,
               CASE WHEN base.status IN ('PRESENT','LATE') AND base.n % 3 = 0
                         AND extract(day FROM base.d) IN (12, 26) THEN 90 ELSE 0 END AS ot_min
      ) x
    ON CONFLICT (employee_id, work_date) DO NOTHING;

    -- One sample kasbon so the installment deduction can be verified.
    INSERT INTO employee_advances (tenant_id, outlet_id, employee_id, amount, installment_amount, remaining_balance,
                                   issued_on, reason)
    SELECT v_tenant, e.outlet_id, e.id, 600000, 200000, 600000, DATE '2026-08-20', 'DATA CONTOH - kasbon keperluan keluarga'
      FROM employees e
     WHERE e.tenant_id = v_tenant AND e.employee_code = 'TSH-005'
       AND NOT EXISTS (SELECT 1 FROM employee_advances a WHERE a.employee_id = e.id);
END $$;
-- +goose StatementEnd

-- +goose Down
DROP TRIGGER IF EXISTS payroll_slips_frozen ON payroll_slips;
DROP FUNCTION IF EXISTS payroll_slips_guard_frozen();
DROP TABLE IF EXISTS employee_advance_repayments;
DROP TABLE IF EXISTS payroll_slips;
DROP TABLE IF EXISTS payroll_runs;
DROP TABLE IF EXISTS employee_advances;
DROP TABLE IF EXISTS attendance_records;
DROP TABLE IF EXISTS employees;
DROP TABLE IF EXISTS shift_definitions;
DROP TABLE IF EXISTS payroll_policies;
DELETE FROM user_role_assignments WHERE user_id IN (SELECT id FROM users WHERE username IN ('manager_steak', 'manager_garden'));
DELETE FROM users WHERE username IN ('manager_steak', 'manager_garden');
DELETE FROM role_permissions WHERE permission_code IN ('hr.employee.manage', 'hr.attendance.manage', 'hr.payroll.manage', 'hr.payroll.approve');
DELETE FROM permissions WHERE code IN ('hr.employee.manage', 'hr.attendance.manage', 'hr.payroll.manage', 'hr.payroll.approve');
