// Package usecase holds the payroll business rules: authorization, validation,
// attendance (geofenced clock-in/out), kasbon and the monthly payroll run. The
// money math itself lives in the pure engine package.
package usecase

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"regexp"
	"strings"
	"time"

	"github.com/google/uuid"

	"tropical-fnb/backend/internal/modules/payroll/domain"
	"tropical-fnb/backend/internal/modules/payroll/engine"
)

const dateFmt = "2006-01-02"

var employeeCodeRe = regexp.MustCompile(`^[A-Z0-9][A-Z0-9-]*$`)

// maxMoney is a sanity ceiling (Rp 10 miliar) that catches typos such as an
// extra zero before they reach the database.
const maxMoney int64 = 10_000_000_000

// Usecase implements the payroll application logic.
type Usecase struct {
	repo domain.Repository
	now  func() time.Time
	log  *slog.Logger
}

// New creates the use case with the real clock.
func New(repo domain.Repository, log *slog.Logger) *Usecase {
	if log == nil {
		log = slog.Default()
	}
	return &Usecase{repo: repo, now: time.Now, log: log}
}

// WithClock replaces the clock (tests).
func (uc *Usecase) WithClock(now func() time.Time) *Usecase {
	uc.now = now
	return uc
}

// ------------------------------------------------------------ authorization --

// authorize requires the actor to hold ANY of the permissions for the outlet and
// returns the actor's user id.
func (uc *Usecase) authorize(ctx context.Context, actor domain.Actor, outletID uuid.UUID, perms ...string) (uuid.UUID, error) {
	if outletID == uuid.Nil {
		return uuid.Nil, domain.Validation("outlet wajib dipilih")
	}
	userID, err := uc.repo.ResolveUserID(ctx, actor.TenantID, actor.Username)
	if err != nil {
		return uuid.Nil, err
	}
	for _, p := range perms {
		ok, err := uc.repo.HasPermission(ctx, actor.TenantID, actor.Username, outletID, p)
		if err != nil {
			return uuid.Nil, err
		}
		if ok {
			return userID, nil
		}
	}
	return uuid.Nil, domain.Forbidden("Anda tidak memiliki izin untuk aksi ini pada outlet tersebut")
}

func (uc *Usecase) audit(ctx context.Context, actor domain.Actor, userID uuid.UUID, outletID uuid.UUID, action, entityType string, entityID uuid.UUID, before, after any) {
	// The business action has already committed, so an audit failure cannot undo
	// it; it is logged at error level so operations can alert on it. The most
	// sensitive action (payroll approval) is audited INSIDE its own transaction
	// by the repository and therefore cannot be lost this way.
	if err := uc.repo.WriteAudit(ctx, domain.AuditEntry{
		TenantID: actor.TenantID, OutletID: &outletID, ActorID: &userID,
		Action: action, EntityType: entityType, EntityID: &entityID, Before: before, After: after,
	}); err != nil {
		uc.log.Error("audit write failed", "action", action, "entity_id", entityID, "error", err)
	}
}

// ------------------------------------------------------------------- policy --

// GetPolicy returns the outlet's payroll policy.
func (uc *Usecase) GetPolicy(ctx context.Context, actor domain.Actor, outletID uuid.UUID) (*domain.Policy, error) {
	if _, err := uc.authorize(ctx, actor, outletID, domain.PermPayrollView, domain.PermPayrollManage); err != nil {
		return nil, err
	}
	p, err := uc.repo.GetPolicy(ctx, actor.TenantID, outletID)
	if err != nil {
		return nil, err
	}
	if info, err := uc.repo.GetOutletInfo(ctx, actor.TenantID, outletID); err == nil && info != nil {
		p.OutletCode = info.Code
		p.OutletName = info.Name
		p.GeofenceLatitude = info.Latitude
		p.GeofenceLongitude = info.Longitude
		p.GeofenceRadiusMeters = info.GeofenceRadius
	}
	return p, nil
}

func validatePolicy(p domain.Policy) error {
	checks := []struct {
		ok  bool
		msg string
	}{
		{p.PayDay >= 1 && p.PayDay <= 28, "tanggal gajian harus 1-28"},
		{p.WorkingDaysBasis >= 20 && p.WorkingDaysBasis <= 31, "hari kerja per bulan harus 20-31"},
		{p.LateGraceMinutes >= 0 && p.LateGraceMinutes <= 120, "toleransi terlambat harus 0-120 menit"},
		{p.LateDeductionPerMinute >= 0 && p.LateDeductionPerMinute <= 1_000_000, "potongan terlambat per menit harus 0-1.000.000"},
		{p.OvertimeDivisor >= 1 && p.OvertimeDivisor <= 400, "pembagi upah lembur harus 1-400"},
		{p.BPJSKesWageCap >= 0 && p.BPJSKesWageCap <= maxMoney, "batas upah BPJS Kesehatan tidak valid"},
		{p.BPJSJPWageCap >= 0 && p.BPJSJPWageCap <= maxMoney, "batas upah BPJS JP tidak valid"},
		{p.GeofenceRadiusMeters >= 0 && p.GeofenceRadiusMeters <= 50000, "radius geofence harus 0-50000 meter"},
	}
	for _, c := range checks {
		if !c.ok {
			return domain.Validation("%s", c.msg)
		}
	}
	bps := map[string]int{
		"BPJS Kesehatan karyawan": p.BPJSKesEmployeeBps, "BPJS Kesehatan perusahaan": p.BPJSKesEmployerBps,
		"BPJS JHT karyawan": p.BPJSJHTEmployeeBps, "BPJS JHT perusahaan": p.BPJSJHTEmployerBps,
		"BPJS JP karyawan": p.BPJSJPEmployeeBps, "BPJS JP perusahaan": p.BPJSJPEmployerBps,
		"BPJS JKK": p.BPJSJKKEmployerBps, "BPJS JKM": p.BPJSJKMEmployerBps,
		"porsi service charge karyawan": p.ServiceChargeEmployeeShareBps,
	}
	for name, v := range bps {
		if v < 0 || v > 10000 {
			return domain.Validation("%s harus 0-10000 basis poin (100 bps = 1%%)", name)
		}
	}
	return nil
}

// UpdatePolicy changes the payroll rulebook. Owner-only (approve permission)
// because it decides how everyone is paid; the change is audited.
func (uc *Usecase) UpdatePolicy(ctx context.Context, actor domain.Actor, p domain.Policy) (*domain.Policy, error) {
	userID, err := uc.authorize(ctx, actor, p.OutletID, domain.PermPayrollApprove)
	if err != nil {
		return nil, err
	}
	if err := validatePolicy(p); err != nil {
		return nil, err
	}
	before, err := uc.repo.GetPolicy(ctx, actor.TenantID, p.OutletID)
	if err != nil {
		return nil, err
	}
	saved, err := uc.repo.UpdatePolicy(ctx, actor.TenantID, p, userID)
	if err != nil {
		return nil, err
	}
	if info, err := uc.repo.GetOutletInfo(ctx, actor.TenantID, p.OutletID); err == nil && info != nil {
		saved.OutletCode = info.Code
		saved.OutletName = info.Name
		saved.GeofenceLatitude = info.Latitude
		saved.GeofenceLongitude = info.Longitude
		saved.GeofenceRadiusMeters = info.GeofenceRadius
	}
	uc.audit(ctx, actor, userID, p.OutletID, "payroll.policy.update", "payroll_policy", p.OutletID, before, saved)
	return saved, nil
}

// ListShifts lists the outlet's shifts.
func (uc *Usecase) ListShifts(ctx context.Context, actor domain.Actor, outletID uuid.UUID) ([]domain.Shift, error) {
	if _, err := uc.authorize(ctx, actor, outletID, domain.PermPayrollView, domain.PermAttendanceManage, domain.PermEmployeeManage); err != nil {
		return nil, err
	}
	return uc.repo.ListShifts(ctx, actor.TenantID, outletID)
}

// ---------------------------------------------------------------- employees --

// EmployeeInput is the create/update payload.
type EmployeeInput struct {
	OutletID            uuid.UUID  `json:"outlet_id"`
	UserID              *uuid.UUID `json:"user_id"`
	EmployeeCode        string     `json:"employee_code"`
	FullName            string     `json:"full_name"`
	PositionTitle       string     `json:"position_title"`
	EmploymentStatus    string     `json:"employment_status"`
	JoinDate            string     `json:"join_date"`
	ResignDate          *string    `json:"resign_date"`
	BaseSalary          int64      `json:"base_salary"`
	PositionAllowance   int64      `json:"position_allowance"`
	MealAllowancePerDay int64      `json:"meal_allowance_per_day"`
	BPJSEnrolled        bool       `json:"bpjs_enrolled"`
	ServiceChargePoints int        `json:"service_charge_points"`
	DefaultShiftID      *uuid.UUID `json:"default_shift_id"`
	BankName            *string    `json:"bank_name"`
	BankAccount         *string    `json:"bank_account"`
	IsActive            bool       `json:"is_active"`
	Notes               *string    `json:"notes"`
}

func (uc *Usecase) validateEmployee(ctx context.Context, tenantID uuid.UUID, in *EmployeeInput) error {
	in.EmployeeCode = strings.ToUpper(strings.TrimSpace(in.EmployeeCode))
	in.FullName = strings.TrimSpace(in.FullName)
	in.PositionTitle = strings.TrimSpace(in.PositionTitle)
	if !employeeCodeRe.MatchString(in.EmployeeCode) {
		return domain.Validation("kode karyawan hanya huruf besar, angka, dan tanda minus (contoh TSH-007)")
	}
	if in.FullName == "" {
		return domain.Validation("nama karyawan wajib diisi")
	}
	if in.PositionTitle == "" {
		return domain.Validation("jabatan wajib diisi")
	}
	switch in.EmploymentStatus {
	case "PERMANENT", "CONTRACT", "PROBATION":
	default:
		return domain.Validation("status kepegawaian harus PERMANENT, CONTRACT, atau PROBATION")
	}
	join, err := time.Parse(dateFmt, in.JoinDate)
	if err != nil {
		return domain.Validation("tanggal masuk harus berformat YYYY-MM-DD")
	}
	if in.ResignDate != nil && *in.ResignDate != "" {
		resign, err := time.Parse(dateFmt, *in.ResignDate)
		if err != nil {
			return domain.Validation("tanggal keluar harus berformat YYYY-MM-DD")
		}
		if resign.Before(join) {
			return domain.Validation("tanggal keluar tidak boleh sebelum tanggal masuk")
		}
	} else {
		in.ResignDate = nil
	}
	for name, v := range map[string]int64{
		"gaji pokok": in.BaseSalary, "tunjangan jabatan": in.PositionAllowance, "uang makan per hari": in.MealAllowancePerDay,
	} {
		if v < 0 || v > maxMoney {
			return domain.Validation("%s harus antara Rp 0 dan Rp 10.000.000.000", name)
		}
	}
	if in.ServiceChargePoints < 0 || in.ServiceChargePoints > 100000 {
		return domain.Validation("poin service charge harus 0-100000 (100 = 1,00 poin)")
	}
	if in.DefaultShiftID != nil {
		sh, err := uc.repo.GetShift(ctx, tenantID, *in.DefaultShiftID)
		if err != nil {
			return err
		}
		if sh.OutletID != in.OutletID {
			return domain.Validation("shift yang dipilih bukan milik outlet karyawan")
		}
	}
	return nil
}

// ListEmployees lists employees of an outlet.
func (uc *Usecase) ListEmployees(ctx context.Context, actor domain.Actor, outletID uuid.UUID, includeInactive bool) ([]domain.Employee, error) {
	if _, err := uc.authorize(ctx, actor, outletID, domain.PermPayrollView, domain.PermEmployeeManage); err != nil {
		return nil, err
	}
	return uc.repo.ListEmployees(ctx, actor.TenantID, outletID, includeInactive)
}

// CreateEmployee adds an employee to an outlet.
func (uc *Usecase) CreateEmployee(ctx context.Context, actor domain.Actor, in EmployeeInput) (*domain.Employee, error) {
	userID, err := uc.authorize(ctx, actor, in.OutletID, domain.PermEmployeeManage)
	if err != nil {
		return nil, err
	}
	if err := uc.validateEmployee(ctx, actor.TenantID, &in); err != nil {
		return nil, err
	}
	created, err := uc.repo.CreateEmployee(ctx, employeeFromInput(actor.TenantID, uuid.Nil, in))
	if err != nil {
		return nil, err
	}
	uc.audit(ctx, actor, userID, in.OutletID, "hr.employee.create", "employee", created.ID, nil, created)
	return created, nil
}

// UpdateEmployee edits an employee. The outlet cannot change; salary changes are audited.
func (uc *Usecase) UpdateEmployee(ctx context.Context, actor domain.Actor, employeeID uuid.UUID, in EmployeeInput) (*domain.Employee, error) {
	existing, err := uc.repo.GetEmployee(ctx, actor.TenantID, employeeID)
	if err != nil {
		return nil, err
	}
	userID, err := uc.authorize(ctx, actor, existing.OutletID, domain.PermEmployeeManage)
	if err != nil {
		return nil, err
	}
	in.OutletID = existing.OutletID // moving an employee between outlets is not allowed here
	if err := uc.validateEmployee(ctx, actor.TenantID, &in); err != nil {
		return nil, err
	}
	updated, err := uc.repo.UpdateEmployee(ctx, employeeFromInput(actor.TenantID, employeeID, in))
	if err != nil {
		return nil, err
	}
	uc.audit(ctx, actor, userID, existing.OutletID, "hr.employee.update", "employee", employeeID, existing, updated)
	return updated, nil
}

func employeeFromInput(tenantID, id uuid.UUID, in EmployeeInput) domain.Employee {
	return domain.Employee{
		ID: id, TenantID: tenantID, OutletID: in.OutletID, UserID: in.UserID, EmployeeCode: in.EmployeeCode,
		FullName: in.FullName, PositionTitle: in.PositionTitle, EmploymentStatus: in.EmploymentStatus,
		JoinDate: in.JoinDate, ResignDate: in.ResignDate, BaseSalary: in.BaseSalary,
		PositionAllowance: in.PositionAllowance, MealAllowancePerDay: in.MealAllowancePerDay,
		BPJSEnrolled: in.BPJSEnrolled, ServiceChargePoints: in.ServiceChargePoints,
		DefaultShiftID: in.DefaultShiftID, BankName: in.BankName, BankAccount: in.BankAccount,
		IsActive: in.IsActive, Notes: in.Notes,
	}
}

// --------------------------------------------------------------- attendance --

func (uc *Usecase) outletLocation(info *domain.OutletInfo) (*time.Location, error) {
	loc, err := time.LoadLocation(info.Timezone)
	if err != nil {
		return nil, fmt.Errorf("load timezone %q: %w", info.Timezone, err)
	}
	return loc, nil
}

// ensurePeriodOpen rejects edits to a month whose payroll run is already APPROVED/PAID.
func (uc *Usecase) ensurePeriodOpen(ctx context.Context, tenantID, outletID uuid.UUID, workDate string) error {
	d, err := time.Parse(dateFmt, workDate)
	if err != nil {
		return domain.Validation("tanggal harus berformat YYYY-MM-DD")
	}
	run, err := uc.repo.GetRunByPeriod(ctx, tenantID, outletID, d.Year(), int(d.Month()))
	if err != nil {
		return err
	}
	if run != nil && (run.Status == domain.RunApproved || run.Status == domain.RunPaid) {
		return domain.Conflict("periode %02d/%d sudah %s dan terkunci; absensi tidak bisa diubah", d.Month(), d.Year(), run.Status)
	}
	return nil
}

// ListAttendance lists an outlet's attendance in a date range (max 62 days).
func (uc *Usecase) ListAttendance(ctx context.Context, actor domain.Actor, outletID uuid.UUID, from, to string) ([]domain.Attendance, error) {
	if _, err := uc.authorize(ctx, actor, outletID, domain.PermPayrollView, domain.PermAttendanceManage); err != nil {
		return nil, err
	}
	f, err := time.Parse(dateFmt, from)
	if err != nil {
		return nil, domain.Validation("from harus berformat YYYY-MM-DD")
	}
	t, err := time.Parse(dateFmt, to)
	if err != nil {
		return nil, domain.Validation("to harus berformat YYYY-MM-DD")
	}
	if t.Before(f) || t.Sub(f) > 62*24*time.Hour {
		return nil, domain.Validation("rentang tanggal tidak valid (maksimal 62 hari)")
	}
	return uc.repo.ListAttendance(ctx, actor.TenantID, outletID, from, to)
}

// AttendanceInput is the manual attendance entry/correction payload.
type AttendanceInput struct {
	EmployeeID       uuid.UUID  `json:"employee_id"`
	WorkDate         string     `json:"work_date"`
	ShiftID          *uuid.UUID `json:"shift_id"`
	Status           string     `json:"status"`
	ClockIn          *time.Time `json:"clock_in"`
	ClockOut         *time.Time `json:"clock_out"`
	LateMinutes      int        `json:"late_minutes"`
	OvertimeMinutes  int        `json:"overtime_minutes"`
	OvertimeApproved bool       `json:"overtime_approved"`
	Notes            *string    `json:"notes"`
}

// UpsertAttendance records or corrects an employee-day (manager action, audited).
func (uc *Usecase) UpsertAttendance(ctx context.Context, actor domain.Actor, in AttendanceInput) (*domain.Attendance, error) {
	emp, err := uc.repo.GetEmployee(ctx, actor.TenantID, in.EmployeeID)
	if err != nil {
		return nil, err
	}
	userID, err := uc.authorize(ctx, actor, emp.OutletID, domain.PermAttendanceManage)
	if err != nil {
		return nil, err
	}
	switch in.Status {
	case domain.StatusPresent, domain.StatusLate, domain.StatusAbsent, domain.StatusLeave, domain.StatusSick, domain.StatusOff:
	default:
		return nil, domain.Validation("status absensi harus PRESENT, LATE, ABSENT, LEAVE, SICK, atau OFF")
	}
	day, err := time.Parse(dateFmt, in.WorkDate)
	if err != nil {
		return nil, domain.Validation("tanggal harus berformat YYYY-MM-DD")
	}
	info, err := uc.repo.GetOutletInfo(ctx, actor.TenantID, emp.OutletID)
	if err != nil {
		return nil, err
	}
	loc, err := uc.outletLocation(info)
	if err != nil {
		return nil, err
	}
	if in.WorkDate > uc.now().In(loc).Format(dateFmt) {
		return nil, domain.Validation("tanggal absensi tidak boleh di masa depan")
	}
	joinDate, _ := time.Parse(dateFmt, emp.JoinDate)
	if day.Before(joinDate) {
		return nil, domain.Validation("tanggal absensi sebelum tanggal masuk karyawan")
	}
	if in.LateMinutes < 0 || in.OvertimeMinutes < 0 || in.LateMinutes > 24*60 || in.OvertimeMinutes > 24*60 {
		return nil, domain.Validation("menit terlambat/lembur harus antara 0 dan 1440")
	}
	present := in.Status == domain.StatusPresent || in.Status == domain.StatusLate
	if !present {
		in.LateMinutes, in.OvertimeMinutes, in.OvertimeApproved = 0, 0, false
		in.ClockIn, in.ClockOut = nil, nil
	}
	if in.Status == domain.StatusLate && in.LateMinutes == 0 {
		return nil, domain.Validation("status LATE harus disertai menit terlambat > 0")
	}
	if in.Status == domain.StatusPresent && in.LateMinutes > 0 {
		in.Status = domain.StatusLate
	}
	if in.ShiftID == nil {
		in.ShiftID = emp.DefaultShiftID
	}
	if err := uc.ensurePeriodOpen(ctx, actor.TenantID, emp.OutletID, in.WorkDate); err != nil {
		return nil, err
	}

	before, err := uc.repo.GetAttendanceByDay(ctx, actor.TenantID, emp.ID, in.WorkDate)
	if err != nil {
		return nil, err
	}
	saved, err := uc.repo.UpsertAttendance(ctx, domain.Attendance{
		TenantID: actor.TenantID, OutletID: emp.OutletID, EmployeeID: emp.ID, WorkDate: in.WorkDate,
		ShiftID: in.ShiftID, Status: in.Status, ClockIn: in.ClockIn, ClockOut: in.ClockOut,
		LateMinutes: in.LateMinutes, OvertimeMinutes: in.OvertimeMinutes, OvertimeApproved: in.OvertimeApproved,
		Source: "MANUAL", Notes: in.Notes,
	}, userID)
	if err != nil {
		return nil, err
	}
	uc.audit(ctx, actor, userID, emp.OutletID, "hr.attendance.upsert", "attendance", saved.ID, before, saved)
	return saved, nil
}

// SetOvertimeApproval approves or rejects the overtime of one attendance row.
func (uc *Usecase) SetOvertimeApproval(ctx context.Context, actor domain.Actor, attendanceID uuid.UUID, approved bool) (*domain.Attendance, error) {
	att, err := uc.repo.GetAttendance(ctx, actor.TenantID, attendanceID)
	if err != nil {
		return nil, err
	}
	userID, err := uc.authorize(ctx, actor, att.OutletID, domain.PermAttendanceManage)
	if err != nil {
		return nil, err
	}
	if att.OvertimeMinutes <= 0 {
		return nil, domain.Validation("absensi ini tidak memiliki menit lembur")
	}
	if err := uc.ensurePeriodOpen(ctx, actor.TenantID, att.OutletID, att.WorkDate); err != nil {
		return nil, err
	}
	saved, err := uc.repo.SetOvertimeApproval(ctx, actor.TenantID, attendanceID, approved, userID)
	if err != nil {
		return nil, err
	}
	uc.audit(ctx, actor, userID, att.OutletID, "hr.attendance.overtime_approval", "attendance", attendanceID, att, saved)
	return saved, nil
}

// shiftBounds returns the absolute start/end of a shift on workDate in loc. A
// shift whose end is not after its start crosses midnight and ends next day.
func shiftBounds(sh *domain.Shift, workDate string, loc *time.Location) (time.Time, time.Time, error) {
	day, err := time.ParseInLocation(dateFmt, workDate, loc)
	if err != nil {
		return time.Time{}, time.Time{}, err
	}
	parse := func(hhmm string) (time.Time, error) {
		t, err := time.Parse("15:04", hhmm)
		if err != nil {
			return time.Time{}, err
		}
		return time.Date(day.Year(), day.Month(), day.Day(), t.Hour(), t.Minute(), 0, 0, loc), nil
	}
	start, err := parse(sh.StartTime)
	if err != nil {
		return time.Time{}, time.Time{}, err
	}
	end, err := parse(sh.EndTime)
	if err != nil {
		return time.Time{}, time.Time{}, err
	}
	if !end.After(start) {
		end = end.AddDate(0, 0, 1)
	}
	return start, end, nil
}

// ClockInInput carries the device GPS reading and optional employee_id (when a
// manager/owner records or tests GPS clock-in on behalf of an employee).
type ClockInInput struct {
	EmployeeID *uuid.UUID `json:"employee_id,omitempty"`
	Latitude   float64    `json:"latitude"`
	Longitude  float64    `json:"longitude"`
}

func (uc *Usecase) resolveClockEmployee(ctx context.Context, actor domain.Actor, employeeID *uuid.UUID) (*domain.Employee, error) {
	if employeeID != nil && *employeeID != uuid.Nil {
		emp, err := uc.repo.GetEmployee(ctx, actor.TenantID, *employeeID)
		if err != nil {
			return nil, err
		}
		if emp.Username != nil && *emp.Username == actor.Username {
			return emp, nil
		}
		if _, err := uc.authorize(ctx, actor, emp.OutletID, domain.PermAttendanceManage); err != nil {
			return nil, err
		}
		return emp, nil
	}
	return uc.selfEmployee(ctx, actor)
}

// ClockIn records the caller's (or selected employee's) arrival, enforcing the
// outlet geofence when the policy requires it. Late minutes are measured against the default shift.
func (uc *Usecase) ClockIn(ctx context.Context, actor domain.Actor, in ClockInInput) (*domain.Attendance, error) {
	emp, err := uc.resolveClockEmployee(ctx, actor, in.EmployeeID)
	if err != nil {
		return nil, err
	}
	if in.Latitude < -90 || in.Latitude > 90 || in.Longitude < -180 || in.Longitude > 180 {
		return nil, domain.Validation("koordinat GPS tidak valid")
	}
	info, err := uc.repo.GetOutletInfo(ctx, actor.TenantID, emp.OutletID)
	if err != nil {
		return nil, err
	}
	loc, err := uc.outletLocation(info)
	if err != nil {
		return nil, err
	}
	policy, err := uc.repo.GetPolicy(ctx, actor.TenantID, emp.OutletID)
	if err != nil {
		return nil, err
	}

	var distance *int
	if info.Latitude != nil && info.Longitude != nil {
		d := int(HaversineMeters(in.Latitude, in.Longitude, *info.Latitude, *info.Longitude) + 0.5)
		distance = &d
	}
	if policy.RequireGeofence {
		if distance == nil || info.GeofenceRadius <= 0 {
			return nil, domain.Validation("koordinat/radius geofence outlet belum diatur; hubungi owner")
		}
		if *distance > info.GeofenceRadius {
			return nil, domain.Forbidden("Anda berada %d m dari outlet; absen hanya bisa dalam radius %d m", *distance, info.GeofenceRadius)
		}
	}

	now := uc.now()
	workDate := now.In(loc).Format(dateFmt)
	if existing, err := uc.repo.GetAttendanceByDay(ctx, actor.TenantID, emp.ID, workDate); err != nil {
		return nil, err
	} else if existing != nil {
		return nil, domain.Conflict("absensi hari ini sudah tercatat (%s)", existing.Status)
	}

	status, late := domain.StatusPresent, 0
	var shiftID *uuid.UUID
	if emp.DefaultShiftID != nil {
		sh, err := uc.repo.GetShift(ctx, actor.TenantID, *emp.DefaultShiftID)
		if err != nil {
			return nil, err
		}
		start, _, err := shiftBounds(sh, workDate, loc)
		if err != nil {
			return nil, fmt.Errorf("shift bounds: %w", err)
		}
		shiftID = &sh.ID
		if now.After(start) {
			late = int(now.Sub(start) / time.Minute)
		}
		if late > 0 {
			status = domain.StatusLate
		}
	}

	userID, err := uc.repo.ResolveUserID(ctx, actor.TenantID, actor.Username)
	if err != nil {
		return nil, err
	}
	saved, err := uc.repo.UpsertAttendance(ctx, domain.Attendance{
		TenantID: actor.TenantID, OutletID: emp.OutletID, EmployeeID: emp.ID, WorkDate: workDate,
		ShiftID: shiftID, Status: status, ClockIn: &now, LateMinutes: late,
		Source: "GEOFENCE", DistanceMeters: distance,
	}, userID)
	if err != nil {
		return nil, err
	}
	return saved, nil
}

// ClockOut records the caller's (or selected employee's) departure and the raw
// overtime beyond the shift end. Overtime stays unapproved (and unpaid) until a manager approves it.
func (uc *Usecase) ClockOut(ctx context.Context, actor domain.Actor, employeeID ...*uuid.UUID) (*domain.Attendance, error) {
	var targetEmpID *uuid.UUID
	if len(employeeID) > 0 {
		targetEmpID = employeeID[0]
	}
	emp, err := uc.resolveClockEmployee(ctx, actor, targetEmpID)
	if err != nil {
		return nil, err
	}
	info, err := uc.repo.GetOutletInfo(ctx, actor.TenantID, emp.OutletID)
	if err != nil {
		return nil, err
	}
	loc, err := uc.outletLocation(info)
	if err != nil {
		return nil, err
	}
	now := uc.now()
	yesterday := now.In(loc).AddDate(0, 0, -1).Format(dateFmt)
	open, err := uc.repo.GetOpenAttendance(ctx, actor.TenantID, emp.ID, yesterday)
	if err != nil {
		return nil, err
	}
	if open == nil {
		return nil, domain.Conflict("belum ada absen masuk yang terbuka; lakukan Absen Masuk terlebih dahulu")
	}
	if open.ClockIn != nil && now.Before(*open.ClockIn) {
		return nil, domain.Validation("jam pulang tidak boleh sebelum jam masuk")
	}

	overtime := 0
	if open.ShiftID != nil {
		sh, err := uc.repo.GetShift(ctx, actor.TenantID, *open.ShiftID)
		if err != nil {
			return nil, err
		}
		_, end, err := shiftBounds(sh, open.WorkDate, loc)
		if err != nil {
			return nil, fmt.Errorf("shift bounds: %w", err)
		}
		if now.After(end) {
			overtime = int(now.Sub(end) / time.Minute)
		}
	}

	userID, err := uc.repo.ResolveUserID(ctx, actor.TenantID, actor.Username)
	if err != nil {
		return nil, err
	}
	open.ClockOut = &now
	open.OvertimeMinutes = overtime
	open.OvertimeApproved = false
	return uc.repo.UpsertAttendance(ctx, *open, userID)
}

func (uc *Usecase) selfEmployee(ctx context.Context, actor domain.Actor) (*domain.Employee, error) {
	emp, err := uc.repo.GetEmployeeByUsername(ctx, actor.TenantID, actor.Username)
	if err != nil {
		if app, ok := err.(*domain.AppError); ok && app.Kind == domain.KindNotFound {
			return nil, domain.Forbidden("akun Anda belum terhubung ke data karyawan; hubungi manajer")
		}
		return nil, err
	}
	return emp, nil
}

// ------------------------------------------------------------------- kasbon --

// ListAdvances lists kasbon of an outlet.
func (uc *Usecase) ListAdvances(ctx context.Context, actor domain.Actor, outletID uuid.UUID, onlyActive bool) ([]domain.Advance, error) {
	if _, err := uc.authorize(ctx, actor, outletID, domain.PermPayrollView, domain.PermEmployeeManage); err != nil {
		return nil, err
	}
	return uc.repo.ListAdvances(ctx, actor.TenantID, outletID, onlyActive)
}

// AdvanceInput is the kasbon creation payload.
type AdvanceInput struct {
	EmployeeID        uuid.UUID `json:"employee_id"`
	Amount            int64     `json:"amount"`
	InstallmentAmount int64     `json:"installment_amount"`
	IssuedOn          string    `json:"issued_on"`
	Reason            *string   `json:"reason"`
}

// CreateAdvance issues a kasbon to an employee.
func (uc *Usecase) CreateAdvance(ctx context.Context, actor domain.Actor, in AdvanceInput) (*domain.Advance, error) {
	emp, err := uc.repo.GetEmployee(ctx, actor.TenantID, in.EmployeeID)
	if err != nil {
		return nil, err
	}
	userID, err := uc.authorize(ctx, actor, emp.OutletID, domain.PermEmployeeManage)
	if err != nil {
		return nil, err
	}
	if in.Amount <= 0 || in.Amount > maxMoney {
		return nil, domain.Validation("nominal kasbon harus lebih dari 0")
	}
	if in.InstallmentAmount <= 0 || in.InstallmentAmount > in.Amount {
		return nil, domain.Validation("cicilan per bulan harus > 0 dan tidak boleh melebihi nominal kasbon")
	}
	if _, err := time.Parse(dateFmt, in.IssuedOn); err != nil {
		return nil, domain.Validation("tanggal kasbon harus berformat YYYY-MM-DD")
	}
	created, err := uc.repo.CreateAdvance(ctx, domain.Advance{
		TenantID: actor.TenantID, OutletID: emp.OutletID, EmployeeID: emp.ID, Amount: in.Amount,
		InstallmentAmount: in.InstallmentAmount, IssuedOn: in.IssuedOn, Reason: in.Reason,
	}, userID)
	if err != nil {
		return nil, err
	}
	uc.audit(ctx, actor, userID, emp.OutletID, "hr.advance.create", "employee_advance", created.ID, nil, created)
	return created, nil
}

// CancelAdvance cancels an active kasbon.
func (uc *Usecase) CancelAdvance(ctx context.Context, actor domain.Actor, advanceID uuid.UUID) (*domain.Advance, error) {
	adv, err := uc.repo.GetAdvance(ctx, actor.TenantID, advanceID)
	if err != nil {
		return nil, err
	}
	userID, err := uc.authorize(ctx, actor, adv.OutletID, domain.PermEmployeeManage)
	if err != nil {
		return nil, err
	}
	cancelled, err := uc.repo.CancelAdvance(ctx, actor.TenantID, advanceID)
	if err != nil {
		return nil, err
	}
	uc.audit(ctx, actor, userID, adv.OutletID, "hr.advance.cancel", "employee_advance", advanceID, adv, cancelled)
	return cancelled, nil
}

// ------------------------------------------------------------------ payroll --

// ListRuns lists an outlet's payroll runs.
func (uc *Usecase) ListRuns(ctx context.Context, actor domain.Actor, outletID uuid.UUID) ([]domain.PayrollRun, error) {
	if _, err := uc.authorize(ctx, actor, outletID, domain.PermPayrollView); err != nil {
		return nil, err
	}
	return uc.repo.ListRuns(ctx, actor.TenantID, outletID)
}

// GetRunDetail returns a run with its slips.
func (uc *Usecase) GetRunDetail(ctx context.Context, actor domain.Actor, runID uuid.UUID) (*domain.RunDetail, error) {
	run, err := uc.repo.GetRun(ctx, actor.TenantID, runID)
	if err != nil {
		return nil, err
	}
	if _, err := uc.authorize(ctx, actor, run.OutletID, domain.PermPayrollView); err != nil {
		return nil, err
	}
	slips, err := uc.repo.ListSlips(ctx, actor.TenantID, runID)
	if err != nil {
		return nil, err
	}
	return &domain.RunDetail{PayrollRun: *run, Slips: slips}, nil
}

func policyToEngine(p *domain.Policy) engine.Policy {
	return engine.Policy{
		WorkingDaysBasis:       p.WorkingDaysBasis,
		LateGraceMinutes:       p.LateGraceMinutes,
		LateDeductionPerMinute: p.LateDeductionPerMinute,
		OvertimeDivisor:        int64(p.OvertimeDivisor),

		BPJSKesehatanEmployeeBps: p.BPJSKesEmployeeBps,
		BPJSKesehatanEmployerBps: p.BPJSKesEmployerBps,
		BPJSKesehatanWageCap:     p.BPJSKesWageCap,
		BPJSJHTEmployeeBps:       p.BPJSJHTEmployeeBps,
		BPJSJHTEmployerBps:       p.BPJSJHTEmployerBps,
		BPJSJPEmployeeBps:        p.BPJSJPEmployeeBps,
		BPJSJPEmployerBps:        p.BPJSJPEmployerBps,
		BPJSJPWageCap:            p.BPJSJPWageCap,
		BPJSJKKEmployerBps:       p.BPJSJKKEmployerBps,
		BPJSJKMEmployerBps:       p.BPJSJKMEmployerBps,
	}
}

// GenerateRun computes (or recomputes) the DRAFT payroll of one outlet for a
// finished calendar month. Nothing is persisted outside a single transaction.
func (uc *Usecase) GenerateRun(ctx context.Context, actor domain.Actor, outletID uuid.UUID, year, month int) (*domain.RunDetail, error) {
	userID, err := uc.authorize(ctx, actor, outletID, domain.PermPayrollManage)
	if err != nil {
		return nil, err
	}
	if year < 2000 || year > 2100 || month < 1 || month > 12 {
		return nil, domain.Validation("periode tidak valid")
	}
	info, err := uc.repo.GetOutletInfo(ctx, actor.TenantID, outletID)
	if err != nil {
		return nil, err
	}
	loc, err := uc.outletLocation(info)
	if err != nil {
		return nil, err
	}

	periodStart := time.Date(year, time.Month(month), 1, 0, 0, 0, 0, loc)
	periodEnd := periodStart.AddDate(0, 1, -1)
	today := uc.now().In(loc).Format(dateFmt)
	if periodEnd.Format(dateFmt) >= today {
		return nil, domain.Validation("periode %02d/%d belum selesai; penggajian hanya bisa dibuat setelah bulan berakhir", month, year)
	}

	existing, err := uc.repo.GetRunByPeriod(ctx, actor.TenantID, outletID, year, month)
	if err != nil {
		return nil, err
	}
	if existing != nil && existing.Status != domain.RunDraft {
		return nil, domain.Conflict("penggajian periode %02d/%d sudah %s dan tidak bisa dibuat ulang", month, year, existing.Status)
	}

	policy, err := uc.repo.GetPolicy(ctx, actor.TenantID, outletID)
	if err != nil {
		return nil, err
	}
	ep := policyToEngine(policy)

	startStr, endStr := periodStart.Format(dateFmt), periodEnd.Format(dateFmt)
	allEmployees, err := uc.repo.ListEmployees(ctx, actor.TenantID, outletID, true)
	if err != nil {
		return nil, err
	}
	var employees []domain.Employee
	for _, e := range allEmployees {
		if e.JoinDate > endStr {
			continue // not yet employed in this period
		}
		if e.ResignDate != nil {
			if *e.ResignDate < startStr {
				continue // already left before the period
			}
		} else if !e.IsActive {
			continue
		}
		employees = append(employees, e)
	}
	if len(employees) == 0 {
		return nil, domain.Validation("tidak ada karyawan aktif pada periode ini")
	}

	records, err := uc.repo.ListAttendance(ctx, actor.TenantID, outletID, startStr, endStr)
	if err != nil {
		return nil, err
	}
	type tally struct {
		att engine.Attendance
		n   int
	}
	tallies := make(map[uuid.UUID]*tally, len(employees))
	for _, rec := range records {
		t := tallies[rec.EmployeeID]
		if t == nil {
			t = &tally{}
			tallies[rec.EmployeeID] = t
		}
		t.n++
		switch rec.Status {
		case domain.StatusPresent, domain.StatusLate:
			t.att.DaysPresent++
			if rec.LateMinutes > 0 {
				t.att.LateMinutes = append(t.att.LateMinutes, rec.LateMinutes)
			}
			if rec.OvertimeApproved && rec.OvertimeMinutes > 0 {
				t.att.OvertimeMinutes = append(t.att.OvertimeMinutes, rec.OvertimeMinutes)
			}
		case domain.StatusAbsent:
			t.att.DaysUnexcusedAbsent++
		}
	}

	advances, err := uc.repo.ListAdvances(ctx, actor.TenantID, outletID, true)
	if err != nil {
		return nil, err
	}
	kasbonDue := make(map[uuid.UUID]int64)
	for _, a := range advances {
		due := a.InstallmentAmount
		if a.RemainingBalance < due {
			due = a.RemainingBalance
		}
		kasbonDue[a.EmployeeID] += due
	}

	// Service charge pool: collected from this outlet's paid orders in the period.
	collected, err := uc.repo.ServiceChargeCollected(ctx, actor.TenantID, outletID, periodStart, periodStart.AddDate(0, 1, 0))
	if err != nil {
		return nil, err
	}
	distributable := collected * int64(policy.ServiceChargeEmployeeShareBps) / 10000
	weights := make([]int64, len(employees))
	for i, e := range employees {
		days := 0
		if t := tallies[e.ID]; t != nil {
			days = t.att.DaysPresent
		}
		weights[i] = int64(e.ServiceChargePoints) * int64(days)
	}
	shares := engine.AllocateServiceCharge(distributable, weights)
	var allocated int64
	for _, s := range shares {
		allocated += s
	}

	run := domain.PayrollRun{
		TenantID: actor.TenantID, OutletID: outletID, PeriodYear: year, PeriodMonth: month,
		PeriodStart: startStr, PeriodEnd: endStr,
		PayDate:                    time.Date(year, time.Month(month)+1, policy.PayDay, 0, 0, 0, 0, loc).Format(dateFmt),
		ServiceChargeCollected:     collected,
		ServiceChargeDistributable: distributable,
		ServiceChargeUndistributed: distributable - allocated,
		GeneratedBy:                &userID,
	}
	snapshot, err := json.Marshal(policy)
	if err != nil {
		return nil, fmt.Errorf("marshal policy snapshot: %w", err)
	}
	run.PolicySnapshot = snapshot

	slips := make([]domain.PayrollSlip, 0, len(employees))
	for i, e := range employees {
		t := tallies[e.ID]
		var att engine.Attendance
		recorded := 0
		if t != nil {
			att, recorded = t.att, t.n
		}
		res := engine.Calculate(ep, engine.Input{
			BaseSalary: e.BaseSalary, PositionAllowance: e.PositionAllowance,
			MealAllowancePerDay: e.MealAllowancePerDay, BPJSEnrolled: e.BPJSEnrolled,
			Attendance: att, ServiceChargeShare: shares[i], KasbonDue: kasbonDue[e.ID],
		})

		warnings := append([]string{}, res.Warnings...)
		if recorded == 0 {
			warnings = append(warnings, "Tidak ada data absensi pada periode ini: uang makan Rp 0 dan tidak ada potongan absen")
		}
		if e.JoinDate > startStr {
			warnings = append(warnings, "Karyawan masuk di tengah periode: gaji pokok belum diprorata, tinjau manual")
		}
		if e.ResignDate != nil && *e.ResignDate < endStr {
			warnings = append(warnings, "Karyawan keluar di tengah periode: gaji pokok belum diprorata, tinjau manual")
		}

		late := 0
		for _, m := range att.LateMinutes {
			late += m
		}
		slips = append(slips, domain.PayrollSlip{
			TenantID: actor.TenantID, OutletID: outletID, EmployeeID: e.ID,
			EmployeeCode: e.EmployeeCode, EmployeeName: e.FullName, PositionTitle: e.PositionTitle,
			DaysPresent: att.DaysPresent, DaysUnexcusedAbsent: att.DaysUnexcusedAbsent,
			LateMinutesRaw: late, LateMinutesEffective: res.EffectiveLateMinutes,
			OvertimeMinutes: res.OvertimeMinutes, ServiceChargePoints: e.ServiceChargePoints,
			BaseSalary: res.BaseSalary, PositionAllowance: res.PositionAllowance, MealAllowance: res.MealAllowance,
			OvertimePay: res.OvertimePay, ServiceChargeShare: res.ServiceChargeShare, GrossPay: res.Gross,
			LateDeduction: res.LateDeduction, AbsenceDeduction: res.AbsenceDeduction,
			BPJSKesehatan: res.BPJSKesehatan, BPJSJHT: res.BPJSJHT, BPJSJP: res.BPJSJP,
			KasbonDeduction: res.KasbonDeduction, TotalDeductions: res.TotalDeductions, NetPay: res.NetPay,
			EmployerBPJSKesehatan: res.EmployerBPJSKesehatan, EmployerBPJSJHT: res.EmployerBPJSJHT,
			EmployerBPJSJP: res.EmployerBPJSJP, EmployerBPJSJKK: res.EmployerBPJSJKK,
			EmployerBPJSJKM: res.EmployerBPJSJKM, EmployerContribution: res.EmployerContribution,
			Warnings: warnings,
		})
		run.EmployeeCount++
		run.TotalGross += res.Gross
		run.TotalDeductions += res.TotalDeductions
		run.TotalNet += res.NetPay
		run.TotalEmployerContribution += res.EmployerContribution
	}

	saved, err := uc.repo.SaveDraftRun(ctx, run, slips)
	if err != nil {
		return nil, err
	}
	uc.audit(ctx, actor, userID, outletID, "payroll.run.generate", "payroll_run", saved.ID, nil, map[string]any{
		"period": fmt.Sprintf("%d-%02d", year, month), "employees": saved.EmployeeCount,
		"total_gross": saved.TotalGross, "total_net": saved.TotalNet,
	})
	savedSlips, err := uc.repo.ListSlips(ctx, actor.TenantID, saved.ID)
	if err != nil {
		return nil, err
	}
	return &domain.RunDetail{PayrollRun: *saved, Slips: savedSlips}, nil
}

// ApproveRun freezes a DRAFT run (owner action) and settles kasbon repayments.
func (uc *Usecase) ApproveRun(ctx context.Context, actor domain.Actor, runID uuid.UUID) (*domain.PayrollRun, error) {
	run, err := uc.repo.GetRun(ctx, actor.TenantID, runID)
	if err != nil {
		return nil, err
	}
	userID, err := uc.authorize(ctx, actor, run.OutletID, domain.PermPayrollApprove)
	if err != nil {
		return nil, err
	}
	// The approval audit row is written inside the repository transaction.
	return uc.repo.ApproveRun(ctx, actor.TenantID, runID, userID)
}

// MarkRunPaid records that the approved payroll was transferred.
func (uc *Usecase) MarkRunPaid(ctx context.Context, actor domain.Actor, runID uuid.UUID) (*domain.PayrollRun, error) {
	run, err := uc.repo.GetRun(ctx, actor.TenantID, runID)
	if err != nil {
		return nil, err
	}
	userID, err := uc.authorize(ctx, actor, run.OutletID, domain.PermPayrollApprove)
	if err != nil {
		return nil, err
	}
	paid, err := uc.repo.MarkRunPaid(ctx, actor.TenantID, runID)
	if err != nil {
		return nil, err
	}
	uc.audit(ctx, actor, userID, run.OutletID, "payroll.run.paid", "payroll_run", runID, run, paid)
	return paid, nil
}

// CancelRun cancels a DRAFT run.
func (uc *Usecase) CancelRun(ctx context.Context, actor domain.Actor, runID uuid.UUID) (*domain.PayrollRun, error) {
	run, err := uc.repo.GetRun(ctx, actor.TenantID, runID)
	if err != nil {
		return nil, err
	}
	userID, err := uc.authorize(ctx, actor, run.OutletID, domain.PermPayrollManage)
	if err != nil {
		return nil, err
	}
	cancelled, err := uc.repo.CancelDraftRun(ctx, actor.TenantID, runID)
	if err != nil {
		return nil, err
	}
	uc.audit(ctx, actor, userID, run.OutletID, "payroll.run.cancel", "payroll_run", runID, run, cancelled)
	return cancelled, nil
}
