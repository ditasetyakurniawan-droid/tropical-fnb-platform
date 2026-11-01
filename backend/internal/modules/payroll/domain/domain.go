// Package domain defines the HR & Payroll entities, repository contract and the
// typed errors the use case returns to the HTTP layer.
//
// All money is whole Rupiah in int64 (never float). Dates are "YYYY-MM-DD"
// strings in the tenant's timezone; instants are time.Time (UTC).
package domain

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
)

// ---------------------------------------------------------------- errors ----

// Kind classifies an AppError so the handler can pick the HTTP status.
type Kind int

const (
	KindValidation Kind = iota + 1
	KindNotFound
	KindConflict
	KindForbidden
)

// AppError is a business error with a user-facing (Indonesian) message.
type AppError struct {
	Kind    Kind
	Message string
}

func (e *AppError) Error() string { return e.Message }

// Validation returns a 422-style error.
func Validation(format string, a ...any) *AppError {
	return &AppError{Kind: KindValidation, Message: fmt.Sprintf(format, a...)}
}

// NotFound returns a 404-style error.
func NotFound(format string, a ...any) *AppError {
	return &AppError{Kind: KindNotFound, Message: fmt.Sprintf(format, a...)}
}

// Conflict returns a 409-style error.
func Conflict(format string, a ...any) *AppError {
	return &AppError{Kind: KindConflict, Message: fmt.Sprintf(format, a...)}
}

// Forbidden returns a 403-style error.
func Forbidden(format string, a ...any) *AppError {
	return &AppError{Kind: KindForbidden, Message: fmt.Sprintf(format, a...)}
}

// ----------------------------------------------------------- permissions ----

// Permission codes (seeded in migration 00007).
const (
	PermPayrollView      = "hr.payroll.view"
	PermEmployeeManage   = "hr.employee.manage"
	PermAttendanceManage = "hr.attendance.manage"
	PermPayrollManage    = "hr.payroll.manage"
	PermPayrollApprove   = "hr.payroll.approve"
)

// Actor is the authenticated caller.
type Actor struct {
	TenantID uuid.UUID
	Username string
}

// ----------------------------------------------------------- entities -------

// OutletInfo carries what attendance and payroll need to know about an outlet.
type OutletInfo struct {
	ID             uuid.UUID `json:"id"`
	Code           string    `json:"code"`
	Name           string    `json:"name"`
	Latitude       *float64  `json:"latitude,omitempty"`
	Longitude      *float64  `json:"longitude,omitempty"`
	GeofenceRadius int       `json:"geofence_radius_meters"`
	Timezone       string    `json:"timezone"`
}

// Policy is the per-outlet payroll rulebook, editable by the owner.
type Policy struct {
	OutletID                      uuid.UUID `json:"outlet_id"`
	OutletCode                    string    `json:"outlet_code,omitempty"`
	OutletName                    string    `json:"outlet_name,omitempty"`
	GeofenceLatitude              *float64  `json:"geofence_latitude,omitempty"`
	GeofenceLongitude             *float64  `json:"geofence_longitude,omitempty"`
	GeofenceRadiusMeters          int       `json:"geofence_radius_meters,omitempty"`
	PayDay                        int       `json:"pay_day"`
	WorkingDaysBasis              int       `json:"working_days_basis"`
	LateGraceMinutes              int       `json:"late_grace_minutes"`
	LateDeductionPerMinute        int64     `json:"late_deduction_per_minute"`
	OvertimeDivisor               int       `json:"overtime_divisor"`
	BPJSKesEmployeeBps            int       `json:"bpjs_kes_employee_bps"`
	BPJSKesEmployerBps            int       `json:"bpjs_kes_employer_bps"`
	BPJSKesWageCap                int64     `json:"bpjs_kes_wage_cap"`
	BPJSJHTEmployeeBps            int       `json:"bpjs_jht_employee_bps"`
	BPJSJHTEmployerBps            int       `json:"bpjs_jht_employer_bps"`
	BPJSJPEmployeeBps             int       `json:"bpjs_jp_employee_bps"`
	BPJSJPEmployerBps             int       `json:"bpjs_jp_employer_bps"`
	BPJSJPWageCap                 int64     `json:"bpjs_jp_wage_cap"`
	BPJSJKKEmployerBps            int       `json:"bpjs_jkk_employer_bps"`
	BPJSJKMEmployerBps            int       `json:"bpjs_jkm_employer_bps"`
	ServiceChargeEmployeeShareBps int       `json:"service_charge_employee_share_bps"`
	RequireGeofence               bool      `json:"require_geofence"`
	IsReviewed                    bool      `json:"is_reviewed"`
	UpdatedAt                     time.Time `json:"updated_at"`
}

// Shift is a work shift of an outlet. Times are "HH:MM".
type Shift struct {
	ID        uuid.UUID `json:"id"`
	OutletID  uuid.UUID `json:"outlet_id"`
	Code      string    `json:"code"`
	Name      string    `json:"name"`
	StartTime string    `json:"start_time"`
	EndTime   string    `json:"end_time"`
}

// Employee is a person paid by an outlet.
type Employee struct {
	ID                  uuid.UUID  `json:"id"`
	TenantID            uuid.UUID  `json:"tenant_id"`
	OutletID            uuid.UUID  `json:"outlet_id"`
	OutletCode          string     `json:"outlet_code"`
	UserID              *uuid.UUID `json:"user_id,omitempty"`
	Username            *string    `json:"username,omitempty"`
	EmployeeCode        string     `json:"employee_code"`
	FullName            string     `json:"full_name"`
	PositionTitle       string     `json:"position_title"`
	EmploymentStatus    string     `json:"employment_status"`
	JoinDate            string     `json:"join_date"`
	ResignDate          *string    `json:"resign_date,omitempty"`
	BaseSalary          int64      `json:"base_salary"`
	PositionAllowance   int64      `json:"position_allowance"`
	MealAllowancePerDay int64      `json:"meal_allowance_per_day"`
	BPJSEnrolled        bool       `json:"bpjs_enrolled"`
	ServiceChargePoints int        `json:"service_charge_points"`
	DefaultShiftID      *uuid.UUID `json:"default_shift_id,omitempty"`
	DefaultShiftCode    *string    `json:"default_shift_code,omitempty"`
	BankName            *string    `json:"bank_name,omitempty"`
	BankAccount         *string    `json:"bank_account,omitempty"`
	IsActive            bool       `json:"is_active"`
	Notes               *string    `json:"notes,omitempty"`
	ActiveKasbon        int64      `json:"active_kasbon_balance"`
}

// Attendance statuses.
const (
	StatusPresent = "PRESENT"
	StatusLate    = "LATE"
	StatusAbsent  = "ABSENT"
	StatusLeave   = "LEAVE"
	StatusSick    = "SICK"
	StatusOff     = "OFF"
)

// Attendance is one employee-day.
type Attendance struct {
	ID               uuid.UUID  `json:"id"`
	TenantID         uuid.UUID  `json:"tenant_id"`
	OutletID         uuid.UUID  `json:"outlet_id"`
	EmployeeID       uuid.UUID  `json:"employee_id"`
	EmployeeCode     string     `json:"employee_code"`
	EmployeeName     string     `json:"employee_name"`
	WorkDate         string     `json:"work_date"`
	ShiftID          *uuid.UUID `json:"shift_id,omitempty"`
	ShiftCode        *string    `json:"shift_code,omitempty"`
	Status           string     `json:"status"`
	ClockIn          *time.Time `json:"clock_in,omitempty"`
	ClockOut         *time.Time `json:"clock_out,omitempty"`
	LateMinutes      int        `json:"late_minutes"`
	OvertimeMinutes  int        `json:"overtime_minutes"`
	OvertimeApproved bool       `json:"overtime_approved"`
	Source           string     `json:"source"`
	DistanceMeters   *int       `json:"clock_in_distance_m,omitempty"`
	Notes            *string    `json:"notes,omitempty"`
}

// Advance (kasbon) statuses.
const (
	AdvanceActive    = "ACTIVE"
	AdvancePaidOff   = "PAID_OFF"
	AdvanceCancelled = "CANCELLED"
)

// Advance is an employee cash advance repaid in monthly installments.
type Advance struct {
	ID                uuid.UUID `json:"id"`
	TenantID          uuid.UUID `json:"tenant_id"`
	OutletID          uuid.UUID `json:"outlet_id"`
	EmployeeID        uuid.UUID `json:"employee_id"`
	EmployeeCode      string    `json:"employee_code"`
	EmployeeName      string    `json:"employee_name"`
	Amount            int64     `json:"amount"`
	InstallmentAmount int64     `json:"installment_amount"`
	RemainingBalance  int64     `json:"remaining_balance"`
	Status            string    `json:"status"`
	IssuedOn          string    `json:"issued_on"`
	Reason            *string   `json:"reason,omitempty"`
	CreatedAt         time.Time `json:"created_at"`
}

// Payroll run statuses.
const (
	RunDraft     = "DRAFT"
	RunApproved  = "APPROVED"
	RunPaid      = "PAID"
	RunCancelled = "CANCELLED"
)

// PayrollRun is the monthly payroll batch of ONE outlet.
type PayrollRun struct {
	ID                         uuid.UUID  `json:"id"`
	TenantID                   uuid.UUID  `json:"tenant_id"`
	OutletID                   uuid.UUID  `json:"outlet_id"`
	OutletCode                 string     `json:"outlet_code"`
	OutletName                 string     `json:"outlet_name"`
	PeriodYear                 int        `json:"period_year"`
	PeriodMonth                int        `json:"period_month"`
	PeriodStart                string     `json:"period_start"`
	PeriodEnd                  string     `json:"period_end"`
	PayDate                    string     `json:"pay_date"`
	Status                     string     `json:"status"`
	ServiceChargeCollected     int64      `json:"service_charge_collected"`
	ServiceChargeDistributable int64      `json:"service_charge_distributable"`
	ServiceChargeUndistributed int64      `json:"service_charge_undistributed"`
	EmployeeCount              int        `json:"employee_count"`
	TotalGross                 int64      `json:"total_gross"`
	TotalDeductions            int64      `json:"total_deductions"`
	TotalNet                   int64      `json:"total_net"`
	TotalEmployerContribution  int64      `json:"total_employer_contribution"`
	PolicySnapshot             []byte     `json:"-"`
	GeneratedByName            *string    `json:"generated_by_name,omitempty"`
	GeneratedAt                time.Time  `json:"generated_at"`
	ApprovedByName             *string    `json:"approved_by_name,omitempty"`
	ApprovedAt                 *time.Time `json:"approved_at,omitempty"`
	PaidAt                     *time.Time `json:"paid_at,omitempty"`
	GeneratedBy                *uuid.UUID `json:"-"`
	ApprovedBy                 *uuid.UUID `json:"-"`
}

// PayrollSlip is one employee's payslip inside a run.
type PayrollSlip struct {
	ID                    uuid.UUID `json:"id"`
	TenantID              uuid.UUID `json:"tenant_id"`
	OutletID              uuid.UUID `json:"outlet_id"`
	RunID                 uuid.UUID `json:"run_id"`
	EmployeeID            uuid.UUID `json:"employee_id"`
	EmployeeCode          string    `json:"employee_code"`
	EmployeeName          string    `json:"employee_name"`
	PositionTitle         string    `json:"position_title"`
	DaysPresent           int       `json:"days_present"`
	DaysUnexcusedAbsent   int       `json:"days_unexcused_absent"`
	LateMinutesRaw        int       `json:"late_minutes_raw"`
	LateMinutesEffective  int       `json:"late_minutes_effective"`
	OvertimeMinutes       int       `json:"overtime_minutes"`
	ServiceChargePoints   int       `json:"service_charge_points"`
	BaseSalary            int64     `json:"base_salary"`
	PositionAllowance     int64     `json:"position_allowance"`
	MealAllowance         int64     `json:"meal_allowance"`
	OvertimePay           int64     `json:"overtime_pay"`
	ServiceChargeShare    int64     `json:"service_charge_share"`
	GrossPay              int64     `json:"gross_pay"`
	LateDeduction         int64     `json:"late_deduction"`
	AbsenceDeduction      int64     `json:"absence_deduction"`
	BPJSKesehatan         int64     `json:"bpjs_kesehatan"`
	BPJSJHT               int64     `json:"bpjs_jht"`
	BPJSJP                int64     `json:"bpjs_jp"`
	KasbonDeduction       int64     `json:"kasbon_deduction"`
	TotalDeductions       int64     `json:"total_deductions"`
	NetPay                int64     `json:"net_pay"`
	EmployerBPJSKesehatan int64     `json:"employer_bpjs_kesehatan"`
	EmployerBPJSJHT       int64     `json:"employer_bpjs_jht"`
	EmployerBPJSJP        int64     `json:"employer_bpjs_jp"`
	EmployerBPJSJKK       int64     `json:"employer_bpjs_jkk"`
	EmployerBPJSJKM       int64     `json:"employer_bpjs_jkm"`
	EmployerContribution  int64     `json:"employer_contribution"`
	Warnings              []string  `json:"warnings"`
}

// RunDetail is a run together with its slips.
type RunDetail struct {
	PayrollRun
	Slips []PayrollSlip `json:"slips"`
}

// AuditEntry is appended to audit_logs for every sensitive HR action.
type AuditEntry struct {
	TenantID   uuid.UUID
	OutletID   *uuid.UUID
	ActorID    *uuid.UUID
	Action     string
	EntityType string
	EntityID   *uuid.UUID
	Before     any
	After      any
}

// ------------------------------------------------------- repository ---------

// Repository is the persistence contract of the payroll module.
type Repository interface {
	// Identity & authorization
	ResolveUserID(ctx context.Context, tenantID uuid.UUID, username string) (uuid.UUID, error)
	HasPermission(ctx context.Context, tenantID uuid.UUID, username string, outletID uuid.UUID, permission string) (bool, error)
	GetOutletInfo(ctx context.Context, tenantID, outletID uuid.UUID) (*OutletInfo, error)
	WriteAudit(ctx context.Context, e AuditEntry) error

	// Policy & shifts
	GetPolicy(ctx context.Context, tenantID, outletID uuid.UUID) (*Policy, error)
	UpdatePolicy(ctx context.Context, tenantID uuid.UUID, p Policy, updatedBy uuid.UUID) (*Policy, error)
	ListShifts(ctx context.Context, tenantID, outletID uuid.UUID) ([]Shift, error)
	GetShift(ctx context.Context, tenantID, shiftID uuid.UUID) (*Shift, error)

	// Employees
	ListEmployees(ctx context.Context, tenantID, outletID uuid.UUID, includeInactive bool) ([]Employee, error)
	GetEmployee(ctx context.Context, tenantID, employeeID uuid.UUID) (*Employee, error)
	GetEmployeeByUsername(ctx context.Context, tenantID uuid.UUID, username string) (*Employee, error)
	CreateEmployee(ctx context.Context, e Employee) (*Employee, error)
	UpdateEmployee(ctx context.Context, e Employee) (*Employee, error)

	// Attendance
	ListAttendance(ctx context.Context, tenantID, outletID uuid.UUID, fromDate, toDate string) ([]Attendance, error)
	GetAttendanceByDay(ctx context.Context, tenantID, employeeID uuid.UUID, workDate string) (*Attendance, error)
	GetOpenAttendance(ctx context.Context, tenantID, employeeID uuid.UUID, sinceDate string) (*Attendance, error)
	GetAttendance(ctx context.Context, tenantID, attendanceID uuid.UUID) (*Attendance, error)
	UpsertAttendance(ctx context.Context, a Attendance, actor uuid.UUID) (*Attendance, error)
	SetOvertimeApproval(ctx context.Context, tenantID, attendanceID uuid.UUID, approved bool, approver uuid.UUID) (*Attendance, error)

	// Kasbon
	ListAdvances(ctx context.Context, tenantID, outletID uuid.UUID, onlyActive bool) ([]Advance, error)
	GetAdvance(ctx context.Context, tenantID, advanceID uuid.UUID) (*Advance, error)
	CreateAdvance(ctx context.Context, a Advance, actor uuid.UUID) (*Advance, error)
	CancelAdvance(ctx context.Context, tenantID, advanceID uuid.UUID) (*Advance, error)

	// Payroll
	ListRuns(ctx context.Context, tenantID, outletID uuid.UUID) ([]PayrollRun, error)
	GetRun(ctx context.Context, tenantID, runID uuid.UUID) (*PayrollRun, error)
	GetRunByPeriod(ctx context.Context, tenantID, outletID uuid.UUID, year, month int) (*PayrollRun, error)
	ListSlips(ctx context.Context, tenantID, runID uuid.UUID) ([]PayrollSlip, error)
	ServiceChargeCollected(ctx context.Context, tenantID, outletID uuid.UUID, from, to time.Time) (int64, error)
	// SaveDraftRun atomically replaces any existing DRAFT run of the same period.
	SaveDraftRun(ctx context.Context, run PayrollRun, slips []PayrollSlip) (*PayrollRun, error)
	// ApproveRun atomically approves a DRAFT run and settles kasbon repayments.
	ApproveRun(ctx context.Context, tenantID, runID, approver uuid.UUID) (*PayrollRun, error)
	MarkRunPaid(ctx context.Context, tenantID, runID uuid.UUID) (*PayrollRun, error)
	CancelDraftRun(ctx context.Context, tenantID, runID uuid.UUID) (*PayrollRun, error)
}
