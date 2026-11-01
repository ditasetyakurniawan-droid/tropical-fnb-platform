// Package repository implements the payroll persistence layer on PostgreSQL.
//
// Money columns are NUMERIC(18,2) holding whole Rupiah; they are read with
// "::bigint" so the Go side never touches floating point.
package repository

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"

	"tropical-fnb/backend/internal/modules/payroll/domain"
	"tropical-fnb/backend/internal/platform/database"
)

const dateFmt = "2006-01-02"

// PostgresPayrollRepository implements domain.Repository.
type PostgresPayrollRepository struct {
	txMgr *database.TxManager
}

// NewPostgresPayrollRepository creates the repository.
func NewPostgresPayrollRepository(txMgr *database.TxManager) *PostgresPayrollRepository {
	return &PostgresPayrollRepository{txMgr: txMgr}
}

func parseDate(s string) (time.Time, error) {
	t, err := time.Parse(dateFmt, s)
	if err != nil {
		return time.Time{}, domain.Validation("format tanggal harus YYYY-MM-DD: %q", s)
	}
	return t, nil
}

func pgCode(err error) string {
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) {
		return pgErr.Code
	}
	return ""
}

// ------------------------------------------------------ identity & authz ----

// ResolveUserID maps a JWT username to the user's UUID.
func (r *PostgresPayrollRepository) ResolveUserID(ctx context.Context, tenantID uuid.UUID, username string) (uuid.UUID, error) {
	var id uuid.UUID
	err := r.txMgr.Conn(ctx).QueryRow(ctx,
		`SELECT id FROM users WHERE tenant_id = $1 AND username = $2 AND is_active AND deleted_at IS NULL`,
		tenantID, username).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		return uuid.Nil, domain.Forbidden("akun tidak aktif atau tidak ditemukan")
	}
	if err != nil {
		return uuid.Nil, fmt.Errorf("resolve user: %w", err)
	}
	return id, nil
}

// HasPermission checks role_permissions through the user's role assignments. An
// assignment with outlet_id NULL covers every outlet of the tenant; otherwise it
// must be for exactly the requested outlet. The check is done in the database on
// every call, so revoking a role takes effect immediately (no stale JWT claims).
func (r *PostgresPayrollRepository) HasPermission(ctx context.Context, tenantID uuid.UUID, username string, outletID uuid.UUID, permission string) (bool, error) {
	var ok bool
	err := r.txMgr.Conn(ctx).QueryRow(ctx, `
		SELECT EXISTS (
			SELECT 1
			  FROM users u
			  JOIN user_role_assignments ura ON ura.tenant_id = u.tenant_id AND ura.user_id = u.id
			  JOIN role_permissions rp ON rp.role_id = ura.role_id
			 WHERE u.tenant_id = $1 AND u.username = $2 AND u.is_active AND u.deleted_at IS NULL
			   AND rp.permission_code = $4
			   AND (ura.outlet_id IS NULL OR ura.outlet_id = $3)
		)`, tenantID, username, outletID, permission).Scan(&ok)
	if err != nil {
		return false, fmt.Errorf("check permission: %w", err)
	}
	return ok, nil
}

// GetOutletInfo loads geofence data and the tenant timezone for an outlet.
func (r *PostgresPayrollRepository) GetOutletInfo(ctx context.Context, tenantID, outletID uuid.UUID) (*domain.OutletInfo, error) {
	var o domain.OutletInfo
	err := r.txMgr.Conn(ctx).QueryRow(ctx, `
		SELECT o.id, o.code, o.name, o.latitude::float8, o.longitude::float8,
		       COALESCE(o.geofence_radius_meters, 0), t.timezone
		  FROM outlets o JOIN tenants t ON t.id = o.tenant_id
		 WHERE o.tenant_id = $1 AND o.id = $2 AND o.deleted_at IS NULL`,
		tenantID, outletID).Scan(&o.ID, &o.Code, &o.Name, &o.Latitude, &o.Longitude, &o.GeofenceRadius, &o.Timezone)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, domain.NotFound("outlet tidak ditemukan")
	}
	if err != nil {
		return nil, fmt.Errorf("get outlet: %w", err)
	}
	return &o, nil
}

// WriteAudit appends a row to the immutable audit_logs table.
func (r *PostgresPayrollRepository) WriteAudit(ctx context.Context, e domain.AuditEntry) error {
	toJSON := func(v any) ([]byte, error) {
		if v == nil {
			return nil, nil
		}
		return json.Marshal(v)
	}
	before, err := toJSON(e.Before)
	if err != nil {
		return fmt.Errorf("marshal audit before: %w", err)
	}
	after, err := toJSON(e.After)
	if err != nil {
		return fmt.Errorf("marshal audit after: %w", err)
	}
	_, err = r.txMgr.Conn(ctx).Exec(ctx, `
		INSERT INTO audit_logs (tenant_id, outlet_id, actor_user_id, action, entity_type, entity_id, before_json, after_json)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
		e.TenantID, e.OutletID, e.ActorID, e.Action, e.EntityType, e.EntityID, before, after)
	if err != nil {
		return fmt.Errorf("write audit: %w", err)
	}
	return nil
}

// -------------------------------------------------------- policy & shifts ---

const policyColumns = `
	outlet_id, pay_day, working_days_basis, late_grace_minutes, late_deduction_per_minute::bigint,
	overtime_divisor, bpjs_kes_employee_bps, bpjs_kes_employer_bps, bpjs_kes_wage_cap::bigint,
	bpjs_jht_employee_bps, bpjs_jht_employer_bps, bpjs_jp_employee_bps, bpjs_jp_employer_bps,
	bpjs_jp_wage_cap::bigint, bpjs_jkk_employer_bps, bpjs_jkm_employer_bps,
	service_charge_employee_share_bps, require_geofence, is_reviewed, updated_at`

func scanPolicy(row pgx.Row) (*domain.Policy, error) {
	var p domain.Policy
	err := row.Scan(&p.OutletID, &p.PayDay, &p.WorkingDaysBasis, &p.LateGraceMinutes, &p.LateDeductionPerMinute,
		&p.OvertimeDivisor, &p.BPJSKesEmployeeBps, &p.BPJSKesEmployerBps, &p.BPJSKesWageCap,
		&p.BPJSJHTEmployeeBps, &p.BPJSJHTEmployerBps, &p.BPJSJPEmployeeBps, &p.BPJSJPEmployerBps,
		&p.BPJSJPWageCap, &p.BPJSJKKEmployerBps, &p.BPJSJKMEmployerBps,
		&p.ServiceChargeEmployeeShareBps, &p.RequireGeofence, &p.IsReviewed, &p.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, domain.NotFound("kebijakan payroll outlet belum dibuat")
	}
	if err != nil {
		return nil, fmt.Errorf("scan policy: %w", err)
	}
	return &p, nil
}

// GetPolicy returns the outlet's payroll policy.
func (r *PostgresPayrollRepository) GetPolicy(ctx context.Context, tenantID, outletID uuid.UUID) (*domain.Policy, error) {
	return scanPolicy(r.txMgr.Conn(ctx).QueryRow(ctx,
		`SELECT `+policyColumns+` FROM payroll_policies WHERE tenant_id = $1 AND outlet_id = $2`, tenantID, outletID))
}

// UpdatePolicy overwrites the policy and marks it reviewed.
func (r *PostgresPayrollRepository) UpdatePolicy(ctx context.Context, tenantID uuid.UUID, p domain.Policy, updatedBy uuid.UUID) (*domain.Policy, error) {
	row := r.txMgr.Conn(ctx).QueryRow(ctx, `
		UPDATE payroll_policies SET
			pay_day = $3, working_days_basis = $4, late_grace_minutes = $5, late_deduction_per_minute = $6,
			overtime_divisor = $7, bpjs_kes_employee_bps = $8, bpjs_kes_employer_bps = $9, bpjs_kes_wage_cap = $10,
			bpjs_jht_employee_bps = $11, bpjs_jht_employer_bps = $12, bpjs_jp_employee_bps = $13,
			bpjs_jp_employer_bps = $14, bpjs_jp_wage_cap = $15, bpjs_jkk_employer_bps = $16,
			bpjs_jkm_employer_bps = $17, service_charge_employee_share_bps = $18, require_geofence = $19,
			is_reviewed = true, updated_by = $20
		WHERE tenant_id = $1 AND outlet_id = $2
		RETURNING `+policyColumns,
		tenantID, p.OutletID, p.PayDay, p.WorkingDaysBasis, p.LateGraceMinutes, p.LateDeductionPerMinute,
		p.OvertimeDivisor, p.BPJSKesEmployeeBps, p.BPJSKesEmployerBps, p.BPJSKesWageCap,
		p.BPJSJHTEmployeeBps, p.BPJSJHTEmployerBps, p.BPJSJPEmployeeBps, p.BPJSJPEmployerBps,
		p.BPJSJPWageCap, p.BPJSJKKEmployerBps, p.BPJSJKMEmployerBps, p.ServiceChargeEmployeeShareBps,
		p.RequireGeofence, updatedBy)
	pol, err := scanPolicy(row)
	if err != nil && pgCode(err) == "23514" {
		return nil, domain.Validation("nilai kebijakan di luar batas yang diizinkan")
	}
	if err != nil {
		return nil, err
	}
	if p.GeofenceRadiusMeters > 0 {
		_, err = r.txMgr.Conn(ctx).Exec(ctx, `
			UPDATE outlets SET geofence_radius_meters = $3
			 WHERE tenant_id = $1 AND id = $2`,
			tenantID, p.OutletID, p.GeofenceRadiusMeters)
		if err != nil {
			return nil, fmt.Errorf("update outlet geofence radius: %w", err)
		}
	}
	return pol, nil
}

// ListShifts lists the outlet's active shifts.
func (r *PostgresPayrollRepository) ListShifts(ctx context.Context, tenantID, outletID uuid.UUID) ([]domain.Shift, error) {
	rows, err := r.txMgr.Conn(ctx).Query(ctx, `
		SELECT id, outlet_id, code, name, to_char(start_time, 'HH24:MI'), to_char(end_time, 'HH24:MI')
		  FROM shift_definitions
		 WHERE tenant_id = $1 AND outlet_id = $2 AND is_active
		 ORDER BY start_time, code`, tenantID, outletID)
	if err != nil {
		return nil, fmt.Errorf("list shifts: %w", err)
	}
	defer rows.Close()
	shifts := make([]domain.Shift, 0)
	for rows.Next() {
		var s domain.Shift
		if err := rows.Scan(&s.ID, &s.OutletID, &s.Code, &s.Name, &s.StartTime, &s.EndTime); err != nil {
			return nil, fmt.Errorf("scan shift: %w", err)
		}
		shifts = append(shifts, s)
	}
	return shifts, rows.Err()
}

// GetShift loads one shift.
func (r *PostgresPayrollRepository) GetShift(ctx context.Context, tenantID, shiftID uuid.UUID) (*domain.Shift, error) {
	var s domain.Shift
	err := r.txMgr.Conn(ctx).QueryRow(ctx, `
		SELECT id, outlet_id, code, name, to_char(start_time, 'HH24:MI'), to_char(end_time, 'HH24:MI')
		  FROM shift_definitions WHERE tenant_id = $1 AND id = $2`, tenantID, shiftID).
		Scan(&s.ID, &s.OutletID, &s.Code, &s.Name, &s.StartTime, &s.EndTime)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, domain.NotFound("shift tidak ditemukan")
	}
	if err != nil {
		return nil, fmt.Errorf("get shift: %w", err)
	}
	return &s, nil
}

// -------------------------------------------------------------- employees ---

const employeeSelect = `
	SELECT e.id, e.tenant_id, e.outlet_id, o.code, e.user_id, u.username, e.employee_code, e.full_name,
	       e.position_title, e.employment_status, to_char(e.join_date, 'YYYY-MM-DD'),
	       to_char(e.resign_date, 'YYYY-MM-DD'),
	       e.base_salary::bigint, e.position_allowance::bigint, e.meal_allowance_per_day::bigint,
	       e.bpjs_enrolled, e.service_charge_points, e.default_shift_id, sh.code, e.bank_name, e.bank_account,
	       e.is_active, e.notes,
	       COALESCE((SELECT SUM(a.remaining_balance) FROM employee_advances a
	                  WHERE a.tenant_id = e.tenant_id AND a.employee_id = e.id AND a.status = 'ACTIVE'), 0)::bigint
	  FROM employees e
	  JOIN outlets o ON o.id = e.outlet_id
	  LEFT JOIN users u ON u.id = e.user_id
	  LEFT JOIN shift_definitions sh ON sh.id = e.default_shift_id`

func scanEmployee(row pgx.Row) (*domain.Employee, error) {
	var e domain.Employee
	err := row.Scan(&e.ID, &e.TenantID, &e.OutletID, &e.OutletCode, &e.UserID, &e.Username, &e.EmployeeCode,
		&e.FullName, &e.PositionTitle, &e.EmploymentStatus, &e.JoinDate, &e.ResignDate,
		&e.BaseSalary, &e.PositionAllowance, &e.MealAllowancePerDay, &e.BPJSEnrolled, &e.ServiceChargePoints,
		&e.DefaultShiftID, &e.DefaultShiftCode, &e.BankName, &e.BankAccount, &e.IsActive, &e.Notes, &e.ActiveKasbon)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, domain.NotFound("karyawan tidak ditemukan")
	}
	if err != nil {
		return nil, fmt.Errorf("scan employee: %w", err)
	}
	return &e, nil
}

// ListEmployees lists an outlet's employees.
func (r *PostgresPayrollRepository) ListEmployees(ctx context.Context, tenantID, outletID uuid.UUID, includeInactive bool) ([]domain.Employee, error) {
	rows, err := r.txMgr.Conn(ctx).Query(ctx,
		employeeSelect+`
		 WHERE e.tenant_id = $1 AND e.outlet_id = $2 AND e.deleted_at IS NULL AND ($3 OR e.is_active)
		 ORDER BY e.employee_code`, tenantID, outletID, includeInactive)
	if err != nil {
		return nil, fmt.Errorf("list employees: %w", err)
	}
	defer rows.Close()
	list := make([]domain.Employee, 0)
	for rows.Next() {
		e, err := scanEmployee(rows)
		if err != nil {
			return nil, err
		}
		list = append(list, *e)
	}
	return list, rows.Err()
}

// GetEmployee loads one employee.
func (r *PostgresPayrollRepository) GetEmployee(ctx context.Context, tenantID, employeeID uuid.UUID) (*domain.Employee, error) {
	return scanEmployee(r.txMgr.Conn(ctx).QueryRow(ctx,
		employeeSelect+` WHERE e.tenant_id = $1 AND e.id = $2 AND e.deleted_at IS NULL`, tenantID, employeeID))
}

// GetEmployeeByUsername finds the employee linked to a login.
func (r *PostgresPayrollRepository) GetEmployeeByUsername(ctx context.Context, tenantID uuid.UUID, username string) (*domain.Employee, error) {
	return scanEmployee(r.txMgr.Conn(ctx).QueryRow(ctx,
		employeeSelect+` WHERE e.tenant_id = $1 AND u.username = $2 AND e.deleted_at IS NULL AND e.is_active`, tenantID, username))
}

func mapEmployeeWriteError(err error) error {
	switch pgCode(err) {
	case "23505":
		return domain.Conflict("kode karyawan atau akun login sudah dipakai karyawan lain")
	case "23514":
		return domain.Validation("data karyawan melanggar batas yang diizinkan (gaji tidak boleh negatif/pecahan, kode huruf besar/angka)")
	case "23503":
		return domain.Validation("akun login atau shift yang dipilih tidak valid untuk outlet ini")
	}
	return err
}

// CreateEmployee inserts a new employee.
func (r *PostgresPayrollRepository) CreateEmployee(ctx context.Context, e domain.Employee) (*domain.Employee, error) {
	join, err := parseDate(e.JoinDate)
	if err != nil {
		return nil, err
	}
	var resign *time.Time
	if e.ResignDate != nil && *e.ResignDate != "" {
		t, err := parseDate(*e.ResignDate)
		if err != nil {
			return nil, err
		}
		resign = &t
	}
	var id uuid.UUID
	err = r.txMgr.Conn(ctx).QueryRow(ctx, `
		INSERT INTO employees (tenant_id, outlet_id, user_id, employee_code, full_name, position_title,
			employment_status, join_date, resign_date, base_salary, position_allowance, meal_allowance_per_day,
			bpjs_enrolled, service_charge_points, default_shift_id, bank_name, bank_account, is_active, notes)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
		RETURNING id`,
		e.TenantID, e.OutletID, e.UserID, e.EmployeeCode, e.FullName, e.PositionTitle, e.EmploymentStatus,
		join, resign, e.BaseSalary, e.PositionAllowance, e.MealAllowancePerDay, e.BPJSEnrolled,
		e.ServiceChargePoints, e.DefaultShiftID, e.BankName, e.BankAccount, e.IsActive, e.Notes).Scan(&id)
	if err != nil {
		return nil, mapEmployeeWriteError(fmt.Errorf("insert employee: %w", err))
	}
	return r.GetEmployee(ctx, e.TenantID, id)
}

// UpdateEmployee overwrites the editable fields of an employee.
func (r *PostgresPayrollRepository) UpdateEmployee(ctx context.Context, e domain.Employee) (*domain.Employee, error) {
	join, err := parseDate(e.JoinDate)
	if err != nil {
		return nil, err
	}
	var resign *time.Time
	if e.ResignDate != nil && *e.ResignDate != "" {
		t, err := parseDate(*e.ResignDate)
		if err != nil {
			return nil, err
		}
		resign = &t
	}
	tag, err := r.txMgr.Conn(ctx).Exec(ctx, `
		UPDATE employees SET
			user_id = $3, employee_code = $4, full_name = $5, position_title = $6, employment_status = $7,
			join_date = $8, resign_date = $9, base_salary = $10, position_allowance = $11,
			meal_allowance_per_day = $12, bpjs_enrolled = $13, service_charge_points = $14,
			default_shift_id = $15, bank_name = $16, bank_account = $17, is_active = $18, notes = $19
		WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL`,
		e.TenantID, e.ID, e.UserID, e.EmployeeCode, e.FullName, e.PositionTitle, e.EmploymentStatus,
		join, resign, e.BaseSalary, e.PositionAllowance, e.MealAllowancePerDay, e.BPJSEnrolled,
		e.ServiceChargePoints, e.DefaultShiftID, e.BankName, e.BankAccount, e.IsActive, e.Notes)
	if err != nil {
		return nil, mapEmployeeWriteError(fmt.Errorf("update employee: %w", err))
	}
	if tag.RowsAffected() == 0 {
		return nil, domain.NotFound("karyawan tidak ditemukan")
	}
	return r.GetEmployee(ctx, e.TenantID, e.ID)
}

// ------------------------------------------------------------- attendance ---

const attendanceSelect = `
	SELECT a.id, a.tenant_id, a.outlet_id, a.employee_id, e.employee_code, e.full_name,
	       to_char(a.work_date, 'YYYY-MM-DD'), a.shift_id, sh.code, a.status, a.clock_in, a.clock_out,
	       a.late_minutes, a.overtime_minutes, a.overtime_approved, a.source, a.clock_in_distance_m, a.notes
	  FROM attendance_records a
	  JOIN employees e ON e.id = a.employee_id
	  LEFT JOIN shift_definitions sh ON sh.id = a.shift_id`

func scanAttendance(row pgx.Row) (*domain.Attendance, error) {
	var a domain.Attendance
	err := row.Scan(&a.ID, &a.TenantID, &a.OutletID, &a.EmployeeID, &a.EmployeeCode, &a.EmployeeName,
		&a.WorkDate, &a.ShiftID, &a.ShiftCode, &a.Status, &a.ClockIn, &a.ClockOut,
		&a.LateMinutes, &a.OvertimeMinutes, &a.OvertimeApproved, &a.Source, &a.DistanceMeters, &a.Notes)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, domain.NotFound("data absensi tidak ditemukan")
	}
	if err != nil {
		return nil, fmt.Errorf("scan attendance: %w", err)
	}
	return &a, nil
}

// ListAttendance lists attendance rows of an outlet within [fromDate, toDate].
func (r *PostgresPayrollRepository) ListAttendance(ctx context.Context, tenantID, outletID uuid.UUID, fromDate, toDate string) ([]domain.Attendance, error) {
	from, err := parseDate(fromDate)
	if err != nil {
		return nil, err
	}
	to, err := parseDate(toDate)
	if err != nil {
		return nil, err
	}
	rows, err := r.txMgr.Conn(ctx).Query(ctx,
		attendanceSelect+`
		 WHERE a.tenant_id = $1 AND a.outlet_id = $2 AND a.work_date BETWEEN $3 AND $4
		 ORDER BY a.work_date, e.employee_code`, tenantID, outletID, from, to)
	if err != nil {
		return nil, fmt.Errorf("list attendance: %w", err)
	}
	defer rows.Close()
	list := make([]domain.Attendance, 0)
	for rows.Next() {
		a, err := scanAttendance(rows)
		if err != nil {
			return nil, err
		}
		list = append(list, *a)
	}
	return list, rows.Err()
}

// GetAttendanceByDay returns the employee's record for a day, or nil if none.
func (r *PostgresPayrollRepository) GetAttendanceByDay(ctx context.Context, tenantID, employeeID uuid.UUID, workDate string) (*domain.Attendance, error) {
	d, err := parseDate(workDate)
	if err != nil {
		return nil, err
	}
	a, err := scanAttendance(r.txMgr.Conn(ctx).QueryRow(ctx,
		attendanceSelect+` WHERE a.tenant_id = $1 AND a.employee_id = $2 AND a.work_date = $3`, tenantID, employeeID, d))
	var app *domain.AppError
	if errors.As(err, &app) && app.Kind == domain.KindNotFound {
		return nil, nil
	}
	return a, err
}

// GetOpenAttendance returns the latest record since sinceDate that was clocked
// in but not yet clocked out, or nil.
func (r *PostgresPayrollRepository) GetOpenAttendance(ctx context.Context, tenantID, employeeID uuid.UUID, sinceDate string) (*domain.Attendance, error) {
	d, err := parseDate(sinceDate)
	if err != nil {
		return nil, err
	}
	a, err := scanAttendance(r.txMgr.Conn(ctx).QueryRow(ctx,
		attendanceSelect+`
		 WHERE a.tenant_id = $1 AND a.employee_id = $2 AND a.work_date >= $3
		   AND a.clock_in IS NOT NULL AND a.clock_out IS NULL
		 ORDER BY a.work_date DESC LIMIT 1`, tenantID, employeeID, d))
	var app *domain.AppError
	if errors.As(err, &app) && app.Kind == domain.KindNotFound {
		return nil, nil
	}
	return a, err
}

// GetAttendance loads one attendance row.
func (r *PostgresPayrollRepository) GetAttendance(ctx context.Context, tenantID, attendanceID uuid.UUID) (*domain.Attendance, error) {
	return scanAttendance(r.txMgr.Conn(ctx).QueryRow(ctx,
		attendanceSelect+` WHERE a.tenant_id = $1 AND a.id = $2`, tenantID, attendanceID))
}

// UpsertAttendance creates or replaces the employee's record for a day.
func (r *PostgresPayrollRepository) UpsertAttendance(ctx context.Context, a domain.Attendance, actor uuid.UUID) (*domain.Attendance, error) {
	d, err := parseDate(a.WorkDate)
	if err != nil {
		return nil, err
	}
	var approver *uuid.UUID
	if a.OvertimeApproved {
		approver = &actor
	}
	var id uuid.UUID
	err = r.txMgr.Conn(ctx).QueryRow(ctx, `
		INSERT INTO attendance_records (tenant_id, outlet_id, employee_id, work_date, shift_id, status,
			clock_in, clock_out, late_minutes, overtime_minutes, overtime_approved, overtime_approved_by,
			source, clock_in_distance_m, clock_in_lat, clock_in_lng, notes, created_by)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
		ON CONFLICT (employee_id, work_date) DO UPDATE SET
			shift_id = EXCLUDED.shift_id, status = EXCLUDED.status, clock_in = EXCLUDED.clock_in,
			clock_out = EXCLUDED.clock_out, late_minutes = EXCLUDED.late_minutes,
			overtime_minutes = EXCLUDED.overtime_minutes, overtime_approved = EXCLUDED.overtime_approved,
			overtime_approved_by = EXCLUDED.overtime_approved_by, source = EXCLUDED.source,
			notes = EXCLUDED.notes
		RETURNING id`,
		a.TenantID, a.OutletID, a.EmployeeID, d, a.ShiftID, a.Status, a.ClockIn, a.ClockOut,
		a.LateMinutes, a.OvertimeMinutes, a.OvertimeApproved, approver, a.Source, a.DistanceMeters,
		nil, nil, a.Notes, actor).Scan(&id)
	if err != nil {
		switch pgCode(err) {
		case "23514":
			return nil, domain.Validation("data absensi tidak valid (menit terlambat/lembur hanya untuk hari hadir, jam pulang tidak boleh sebelum jam masuk)")
		case "23503":
			return nil, domain.Validation("karyawan atau shift tidak valid untuk outlet ini")
		}
		return nil, fmt.Errorf("upsert attendance: %w", err)
	}
	return r.GetAttendance(ctx, a.TenantID, id)
}

// SetOvertimeApproval approves or rejects the overtime of one attendance row.
func (r *PostgresPayrollRepository) SetOvertimeApproval(ctx context.Context, tenantID, attendanceID uuid.UUID, approved bool, approver uuid.UUID) (*domain.Attendance, error) {
	var by *uuid.UUID
	if approved {
		by = &approver
	}
	tag, err := r.txMgr.Conn(ctx).Exec(ctx, `
		UPDATE attendance_records SET overtime_approved = $3, overtime_approved_by = $4
		 WHERE tenant_id = $1 AND id = $2`, tenantID, attendanceID, approved, by)
	if err != nil {
		return nil, fmt.Errorf("set overtime approval: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return nil, domain.NotFound("data absensi tidak ditemukan")
	}
	return r.GetAttendance(ctx, tenantID, attendanceID)
}

// ----------------------------------------------------------------- kasbon ---

const advanceSelect = `
	SELECT a.id, a.tenant_id, a.outlet_id, a.employee_id, e.employee_code, e.full_name,
	       a.amount::bigint, a.installment_amount::bigint, a.remaining_balance::bigint, a.status,
	       to_char(a.issued_on, 'YYYY-MM-DD'), a.reason, a.created_at
	  FROM employee_advances a JOIN employees e ON e.id = a.employee_id`

func scanAdvance(row pgx.Row) (*domain.Advance, error) {
	var a domain.Advance
	err := row.Scan(&a.ID, &a.TenantID, &a.OutletID, &a.EmployeeID, &a.EmployeeCode, &a.EmployeeName,
		&a.Amount, &a.InstallmentAmount, &a.RemainingBalance, &a.Status, &a.IssuedOn, &a.Reason, &a.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, domain.NotFound("kasbon tidak ditemukan")
	}
	if err != nil {
		return nil, fmt.Errorf("scan advance: %w", err)
	}
	return &a, nil
}

// ListAdvances lists kasbon of an outlet, oldest first.
func (r *PostgresPayrollRepository) ListAdvances(ctx context.Context, tenantID, outletID uuid.UUID, onlyActive bool) ([]domain.Advance, error) {
	rows, err := r.txMgr.Conn(ctx).Query(ctx,
		advanceSelect+`
		 WHERE a.tenant_id = $1 AND a.outlet_id = $2 AND ($3 = false OR a.status = 'ACTIVE')
		 ORDER BY a.issued_on, a.created_at, a.id`, tenantID, outletID, onlyActive)
	if err != nil {
		return nil, fmt.Errorf("list advances: %w", err)
	}
	defer rows.Close()
	list := make([]domain.Advance, 0)
	for rows.Next() {
		a, err := scanAdvance(rows)
		if err != nil {
			return nil, err
		}
		list = append(list, *a)
	}
	return list, rows.Err()
}

// GetAdvance loads one kasbon.
func (r *PostgresPayrollRepository) GetAdvance(ctx context.Context, tenantID, advanceID uuid.UUID) (*domain.Advance, error) {
	return scanAdvance(r.txMgr.Conn(ctx).QueryRow(ctx,
		advanceSelect+` WHERE a.tenant_id = $1 AND a.id = $2`, tenantID, advanceID))
}

// CreateAdvance issues a new kasbon; the remaining balance starts at the full amount.
func (r *PostgresPayrollRepository) CreateAdvance(ctx context.Context, a domain.Advance, actor uuid.UUID) (*domain.Advance, error) {
	issued, err := parseDate(a.IssuedOn)
	if err != nil {
		return nil, err
	}
	var id uuid.UUID
	err = r.txMgr.Conn(ctx).QueryRow(ctx, `
		INSERT INTO employee_advances (tenant_id, outlet_id, employee_id, amount, installment_amount,
			remaining_balance, issued_on, reason, created_by)
		VALUES ($1,$2,$3,$4,$5,$4,$6,$7,$8) RETURNING id`,
		a.TenantID, a.OutletID, a.EmployeeID, a.Amount, a.InstallmentAmount, issued, a.Reason, actor).Scan(&id)
	if err != nil {
		switch pgCode(err) {
		case "23514":
			return nil, domain.Validation("nominal kasbon harus > 0 dan cicilan tidak boleh melebihi nominal")
		case "23503":
			return nil, domain.Validation("karyawan tidak valid untuk outlet ini")
		}
		return nil, fmt.Errorf("insert advance: %w", err)
	}
	return r.GetAdvance(ctx, a.TenantID, id)
}

// CancelAdvance cancels an ACTIVE kasbon (no further installments are deducted).
func (r *PostgresPayrollRepository) CancelAdvance(ctx context.Context, tenantID, advanceID uuid.UUID) (*domain.Advance, error) {
	tag, err := r.txMgr.Conn(ctx).Exec(ctx,
		`UPDATE employee_advances SET status = 'CANCELLED' WHERE tenant_id = $1 AND id = $2 AND status = 'ACTIVE'`,
		tenantID, advanceID)
	if err != nil {
		return nil, fmt.Errorf("cancel advance: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return nil, domain.Conflict("hanya kasbon berstatus ACTIVE yang bisa dibatalkan")
	}
	return r.GetAdvance(ctx, tenantID, advanceID)
}

// ---------------------------------------------------------------- payroll ---

const runSelect = `
	SELECT pr.id, pr.tenant_id, pr.outlet_id, o.code, o.name, pr.period_year, pr.period_month,
	       to_char(pr.period_start, 'YYYY-MM-DD'), to_char(pr.period_end, 'YYYY-MM-DD'),
	       to_char(pr.pay_date, 'YYYY-MM-DD'), pr.status,
	       pr.service_charge_collected::bigint, pr.service_charge_distributable::bigint,
	       pr.service_charge_undistributed::bigint, pr.employee_count, pr.total_gross::bigint,
	       pr.total_deductions::bigint, pr.total_net::bigint, pr.total_employer_contribution::bigint,
	       pr.policy_snapshot, pr.generated_by, gu.full_name, pr.generated_at,
	       pr.approved_by, au.full_name, pr.approved_at, pr.paid_at
	  FROM payroll_runs pr
	  JOIN outlets o ON o.id = pr.outlet_id
	  LEFT JOIN users gu ON gu.id = pr.generated_by
	  LEFT JOIN users au ON au.id = pr.approved_by`

func scanRun(row pgx.Row) (*domain.PayrollRun, error) {
	var p domain.PayrollRun
	err := row.Scan(&p.ID, &p.TenantID, &p.OutletID, &p.OutletCode, &p.OutletName, &p.PeriodYear, &p.PeriodMonth,
		&p.PeriodStart, &p.PeriodEnd, &p.PayDate, &p.Status,
		&p.ServiceChargeCollected, &p.ServiceChargeDistributable, &p.ServiceChargeUndistributed,
		&p.EmployeeCount, &p.TotalGross, &p.TotalDeductions, &p.TotalNet, &p.TotalEmployerContribution,
		&p.PolicySnapshot, &p.GeneratedBy, &p.GeneratedByName, &p.GeneratedAt,
		&p.ApprovedBy, &p.ApprovedByName, &p.ApprovedAt, &p.PaidAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, domain.NotFound("penggajian tidak ditemukan")
	}
	if err != nil {
		return nil, fmt.Errorf("scan payroll run: %w", err)
	}
	return &p, nil
}

// ListRuns lists the outlet's payroll runs, newest period first (cancelled hidden).
func (r *PostgresPayrollRepository) ListRuns(ctx context.Context, tenantID, outletID uuid.UUID) ([]domain.PayrollRun, error) {
	rows, err := r.txMgr.Conn(ctx).Query(ctx,
		runSelect+`
		 WHERE pr.tenant_id = $1 AND pr.outlet_id = $2 AND pr.status <> 'CANCELLED'
		 ORDER BY pr.period_year DESC, pr.period_month DESC`, tenantID, outletID)
	if err != nil {
		return nil, fmt.Errorf("list runs: %w", err)
	}
	defer rows.Close()
	list := make([]domain.PayrollRun, 0)
	for rows.Next() {
		p, err := scanRun(rows)
		if err != nil {
			return nil, err
		}
		list = append(list, *p)
	}
	return list, rows.Err()
}

// GetRun loads one run.
func (r *PostgresPayrollRepository) GetRun(ctx context.Context, tenantID, runID uuid.UUID) (*domain.PayrollRun, error) {
	return scanRun(r.txMgr.Conn(ctx).QueryRow(ctx,
		runSelect+` WHERE pr.tenant_id = $1 AND pr.id = $2`, tenantID, runID))
}

// GetRunByPeriod returns the live (non-cancelled) run of a month, or nil.
func (r *PostgresPayrollRepository) GetRunByPeriod(ctx context.Context, tenantID, outletID uuid.UUID, year, month int) (*domain.PayrollRun, error) {
	p, err := scanRun(r.txMgr.Conn(ctx).QueryRow(ctx,
		runSelect+` WHERE pr.tenant_id = $1 AND pr.outlet_id = $2 AND pr.period_year = $3
		              AND pr.period_month = $4 AND pr.status <> 'CANCELLED'`, tenantID, outletID, year, month))
	var app *domain.AppError
	if errors.As(err, &app) && app.Kind == domain.KindNotFound {
		return nil, nil
	}
	return p, err
}

// ListSlips lists the slips of a run ordered by employee code.
func (r *PostgresPayrollRepository) ListSlips(ctx context.Context, tenantID, runID uuid.UUID) ([]domain.PayrollSlip, error) {
	rows, err := r.txMgr.Conn(ctx).Query(ctx, `
		SELECT id, tenant_id, outlet_id, run_id, employee_id, employee_code, employee_name, position_title,
		       days_present, days_unexcused_absent, late_minutes_raw, late_minutes_effective, overtime_minutes,
		       service_charge_points,
		       base_salary::bigint, position_allowance::bigint, meal_allowance::bigint, overtime_pay::bigint,
		       service_charge_share::bigint, gross_pay::bigint,
		       late_deduction::bigint, absence_deduction::bigint, bpjs_kesehatan::bigint, bpjs_jht::bigint,
		       bpjs_jp::bigint, kasbon_deduction::bigint, total_deductions::bigint, net_pay::bigint,
		       employer_bpjs_kesehatan::bigint, employer_bpjs_jht::bigint, employer_bpjs_jp::bigint,
		       employer_bpjs_jkk::bigint, employer_bpjs_jkm::bigint, employer_contribution::bigint, warnings
		  FROM payroll_slips WHERE tenant_id = $1 AND run_id = $2 ORDER BY employee_code`, tenantID, runID)
	if err != nil {
		return nil, fmt.Errorf("list slips: %w", err)
	}
	defer rows.Close()
	list := make([]domain.PayrollSlip, 0)
	for rows.Next() {
		var s domain.PayrollSlip
		var warnings []byte
		if err := rows.Scan(&s.ID, &s.TenantID, &s.OutletID, &s.RunID, &s.EmployeeID, &s.EmployeeCode,
			&s.EmployeeName, &s.PositionTitle, &s.DaysPresent, &s.DaysUnexcusedAbsent, &s.LateMinutesRaw,
			&s.LateMinutesEffective, &s.OvertimeMinutes, &s.ServiceChargePoints,
			&s.BaseSalary, &s.PositionAllowance, &s.MealAllowance, &s.OvertimePay, &s.ServiceChargeShare, &s.GrossPay,
			&s.LateDeduction, &s.AbsenceDeduction, &s.BPJSKesehatan, &s.BPJSJHT, &s.BPJSJP, &s.KasbonDeduction,
			&s.TotalDeductions, &s.NetPay, &s.EmployerBPJSKesehatan, &s.EmployerBPJSJHT, &s.EmployerBPJSJP,
			&s.EmployerBPJSJKK, &s.EmployerBPJSJKM, &s.EmployerContribution, &warnings); err != nil {
			return nil, fmt.Errorf("scan slip: %w", err)
		}
		s.Warnings = []string{}
		if len(warnings) > 0 {
			if err := json.Unmarshal(warnings, &s.Warnings); err != nil {
				return nil, fmt.Errorf("decode slip warnings: %w", err)
			}
		}
		list = append(list, s)
	}
	return list, rows.Err()
}

// ServiceChargeCollected sums the service charge of PAID, COMPLETED orders closed in [from, to).
func (r *PostgresPayrollRepository) ServiceChargeCollected(ctx context.Context, tenantID, outletID uuid.UUID, from, to time.Time) (int64, error) {
	var total int64
	err := r.txMgr.Conn(ctx).QueryRow(ctx, `
		SELECT COALESCE(SUM(service_charge_amount), 0)::bigint
		  FROM orders
		 WHERE tenant_id = $1 AND outlet_id = $2 AND deleted_at IS NULL
		   AND payment_status = 'PAID' AND status = 'COMPLETED'
		   AND closed_at >= $3 AND closed_at < $4`, tenantID, outletID, from, to).Scan(&total)
	if err != nil {
		return 0, fmt.Errorf("sum service charge: %w", err)
	}
	return total, nil
}

// SaveDraftRun atomically replaces a DRAFT run of the same outlet/period with the new run and slips.
func (r *PostgresPayrollRepository) SaveDraftRun(ctx context.Context, run domain.PayrollRun, slips []domain.PayrollSlip) (*domain.PayrollRun, error) {
	var saved *domain.PayrollRun
	err := r.txMgr.WithTx(ctx, func(ctx context.Context) error {
		db := r.txMgr.Conn(ctx)

		if _, err := db.Exec(ctx, `
			DELETE FROM payroll_runs
			 WHERE tenant_id = $1 AND outlet_id = $2 AND period_year = $3 AND period_month = $4 AND status = 'DRAFT'`,
			run.TenantID, run.OutletID, run.PeriodYear, run.PeriodMonth); err != nil {
			return fmt.Errorf("delete previous draft: %w", err)
		}

		start, err := parseDate(run.PeriodStart)
		if err != nil {
			return err
		}
		end, err := parseDate(run.PeriodEnd)
		if err != nil {
			return err
		}
		pay, err := parseDate(run.PayDate)
		if err != nil {
			return err
		}
		var runID uuid.UUID
		err = db.QueryRow(ctx, `
			INSERT INTO payroll_runs (tenant_id, outlet_id, period_year, period_month, period_start, period_end,
				pay_date, status, service_charge_collected, service_charge_distributable,
				service_charge_undistributed, employee_count, total_gross, total_deductions, total_net,
				total_employer_contribution, policy_snapshot, generated_by)
			VALUES ($1,$2,$3,$4,$5,$6,$7,'DRAFT',$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
			RETURNING id`,
			run.TenantID, run.OutletID, run.PeriodYear, run.PeriodMonth, start, end, pay,
			run.ServiceChargeCollected, run.ServiceChargeDistributable, run.ServiceChargeUndistributed,
			run.EmployeeCount, run.TotalGross, run.TotalDeductions, run.TotalNet, run.TotalEmployerContribution,
			run.PolicySnapshot, run.GeneratedBy).Scan(&runID)
		if err != nil {
			if pgCode(err) == "23505" {
				return domain.Conflict("penggajian periode ini sudah ada dan tidak berstatus DRAFT")
			}
			return fmt.Errorf("insert run: %w", err)
		}

		for _, s := range slips {
			warnings, err := json.Marshal(s.Warnings)
			if err != nil {
				return fmt.Errorf("encode warnings: %w", err)
			}
			if _, err := db.Exec(ctx, `
				INSERT INTO payroll_slips (tenant_id, outlet_id, run_id, employee_id, employee_code, employee_name,
					position_title, days_present, days_unexcused_absent, late_minutes_raw, late_minutes_effective,
					overtime_minutes, service_charge_points, base_salary, position_allowance, meal_allowance,
					overtime_pay, service_charge_share, gross_pay, late_deduction, absence_deduction,
					bpjs_kesehatan, bpjs_jht, bpjs_jp, kasbon_deduction, total_deductions, net_pay,
					employer_bpjs_kesehatan, employer_bpjs_jht, employer_bpjs_jp, employer_bpjs_jkk,
					employer_bpjs_jkm, employer_contribution, warnings)
				VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,
				        $25,$26,$27,$28,$29,$30,$31,$32,$33,$34)`,
				s.TenantID, s.OutletID, runID, s.EmployeeID, s.EmployeeCode, s.EmployeeName, s.PositionTitle,
				s.DaysPresent, s.DaysUnexcusedAbsent, s.LateMinutesRaw, s.LateMinutesEffective, s.OvertimeMinutes,
				s.ServiceChargePoints, s.BaseSalary, s.PositionAllowance, s.MealAllowance, s.OvertimePay,
				s.ServiceChargeShare, s.GrossPay, s.LateDeduction, s.AbsenceDeduction, s.BPJSKesehatan, s.BPJSJHT,
				s.BPJSJP, s.KasbonDeduction, s.TotalDeductions, s.NetPay, s.EmployerBPJSKesehatan,
				s.EmployerBPJSJHT, s.EmployerBPJSJP, s.EmployerBPJSJKK, s.EmployerBPJSJKM, s.EmployerContribution,
				warnings); err != nil {
				return fmt.Errorf("insert slip %s: %w", s.EmployeeCode, err)
			}
		}

		saved, err = r.GetRun(ctx, run.TenantID, runID)
		return err
	})
	if err != nil {
		return nil, err
	}
	return saved, nil
}

// ApproveRun freezes a DRAFT run and settles kasbon repayments in ONE transaction.
func (r *PostgresPayrollRepository) ApproveRun(ctx context.Context, tenantID, runID, approver uuid.UUID) (*domain.PayrollRun, error) {
	var approved *domain.PayrollRun
	err := r.txMgr.WithTx(ctx, func(ctx context.Context) error {
		db := r.txMgr.Conn(ctx)

		var status string
		var outletID uuid.UUID
		err := db.QueryRow(ctx,
			`SELECT status, outlet_id FROM payroll_runs WHERE tenant_id = $1 AND id = $2 FOR UPDATE`,
			tenantID, runID).Scan(&status, &outletID)
		if errors.Is(err, pgx.ErrNoRows) {
			return domain.NotFound("penggajian tidak ditemukan")
		}
		if err != nil {
			return fmt.Errorf("lock run: %w", err)
		}
		if status != domain.RunDraft {
			return domain.Conflict("hanya penggajian berstatus DRAFT yang bisa disetujui (status saat ini: %s)", status)
		}

		type slipKasbon struct {
			id, employeeID uuid.UUID
			amount         int64
		}
		rows, err := db.Query(ctx, `
			SELECT id, employee_id, kasbon_deduction::bigint FROM payroll_slips
			 WHERE tenant_id = $1 AND run_id = $2 AND kasbon_deduction > 0 ORDER BY employee_code`, tenantID, runID)
		if err != nil {
			return fmt.Errorf("load slip kasbon: %w", err)
		}
		var due []slipKasbon
		for rows.Next() {
			var s slipKasbon
			if err := rows.Scan(&s.id, &s.employeeID, &s.amount); err != nil {
				rows.Close()
				return fmt.Errorf("scan slip kasbon: %w", err)
			}
			due = append(due, s)
		}
		rows.Close()
		if err := rows.Err(); err != nil {
			return err
		}

		for _, s := range due {
			advRows, err := db.Query(ctx, `
				SELECT id, installment_amount::bigint, remaining_balance::bigint FROM employee_advances
				 WHERE tenant_id = $1 AND employee_id = $2 AND status = 'ACTIVE'
				 ORDER BY issued_on, created_at, id FOR UPDATE`, tenantID, s.employeeID)
			if err != nil {
				return fmt.Errorf("lock advances: %w", err)
			}
			type adv struct {
				id                     uuid.UUID
				installment, remaining int64
			}
			var advs []adv
			for advRows.Next() {
				var a adv
				if err := advRows.Scan(&a.id, &a.installment, &a.remaining); err != nil {
					advRows.Close()
					return fmt.Errorf("scan advance: %w", err)
				}
				advs = append(advs, a)
			}
			advRows.Close()
			if err := advRows.Err(); err != nil {
				return err
			}

			left := s.amount
			for _, a := range advs {
				if left == 0 {
					break
				}
				pay := a.installment
				if a.remaining < pay {
					pay = a.remaining
				}
				if left < pay {
					pay = left
				}
				if pay <= 0 {
					continue
				}
				newRemaining := a.remaining - pay
				newStatus := domain.AdvanceActive
				if newRemaining == 0 {
					newStatus = domain.AdvancePaidOff
				}
				if _, err := db.Exec(ctx,
					`UPDATE employee_advances SET remaining_balance = $3, status = $4 WHERE tenant_id = $1 AND id = $2`,
					tenantID, a.id, newRemaining, newStatus); err != nil {
					return fmt.Errorf("update advance: %w", err)
				}
				if _, err := db.Exec(ctx, `
					INSERT INTO employee_advance_repayments (tenant_id, advance_id, slip_id, amount)
					VALUES ($1, $2, $3, $4)`, tenantID, a.id, s.id, pay); err != nil {
					return fmt.Errorf("record repayment: %w", err)
				}
				left -= pay
			}
			if left != 0 {
				return domain.Conflict("saldo kasbon berubah sejak draft dibuat; generate ulang penggajian sebelum menyetujui")
			}
		}

		if _, err := db.Exec(ctx, `
			UPDATE payroll_runs SET status = 'APPROVED', approved_by = $3, approved_at = now()
			 WHERE tenant_id = $1 AND id = $2`, tenantID, runID, approver); err != nil {
			return fmt.Errorf("approve run: %w", err)
		}
		approved, err = r.GetRun(ctx, tenantID, runID)
		if err != nil {
			return err
		}
		// Audited in the SAME transaction: an approval can never exist without its audit row.
		return r.WriteAudit(ctx, domain.AuditEntry{
			TenantID: tenantID, OutletID: &approved.OutletID, ActorID: &approver,
			Action: "payroll.run.approve", EntityType: "payroll_run", EntityID: &runID,
			Before: map[string]any{"status": domain.RunDraft},
			After: map[string]any{
				"status": approved.Status, "period": fmt.Sprintf("%d-%02d", approved.PeriodYear, approved.PeriodMonth),
				"employees": approved.EmployeeCount, "total_gross": approved.TotalGross,
				"total_deductions": approved.TotalDeductions, "total_net": approved.TotalNet,
			},
		})
	})
	if err != nil {
		return nil, err
	}
	return approved, nil
}

// MarkRunPaid moves an APPROVED run to PAID.
func (r *PostgresPayrollRepository) MarkRunPaid(ctx context.Context, tenantID, runID uuid.UUID) (*domain.PayrollRun, error) {
	tag, err := r.txMgr.Conn(ctx).Exec(ctx, `
		UPDATE payroll_runs SET status = 'PAID', paid_at = now()
		 WHERE tenant_id = $1 AND id = $2 AND status = 'APPROVED'`, tenantID, runID)
	if err != nil {
		return nil, fmt.Errorf("mark paid: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return nil, domain.Conflict("hanya penggajian berstatus APPROVED yang bisa ditandai dibayar")
	}
	return r.GetRun(ctx, tenantID, runID)
}

// CancelDraftRun cancels a DRAFT run.
func (r *PostgresPayrollRepository) CancelDraftRun(ctx context.Context, tenantID, runID uuid.UUID) (*domain.PayrollRun, error) {
	tag, err := r.txMgr.Conn(ctx).Exec(ctx, `
		UPDATE payroll_runs SET status = 'CANCELLED'
		 WHERE tenant_id = $1 AND id = $2 AND status = 'DRAFT'`, tenantID, runID)
	if err != nil {
		return nil, fmt.Errorf("cancel run: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return nil, domain.Conflict("hanya penggajian berstatus DRAFT yang bisa dibatalkan")
	}
	return r.GetRun(ctx, tenantID, runID)
}
