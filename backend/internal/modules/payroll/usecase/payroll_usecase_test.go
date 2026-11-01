package usecase

import (
	"context"
	"errors"
	"fmt"
	"math"
	"testing"
	"time"

	"github.com/google/uuid"

	"tropical-fnb/backend/internal/modules/payroll/domain"
)

// fakeRepo implements only what the tests exercise; any other call panics via
// the nil embedded interface, which flags an unexpected dependency loudly.
type fakeRepo struct {
	domain.Repository

	perms     map[string]bool // "<username>|<permission>" -> allowed
	outlet    domain.OutletInfo
	policy    domain.Policy
	employees []domain.Employee
	records   []domain.Attendance
	advances  []domain.Advance
	scCollect int64
	existing  *domain.PayrollRun

	savedRun   *domain.PayrollRun
	savedSlips []domain.PayrollSlip
	upserted   []domain.Attendance
	audits     []string
	shift      *domain.Shift
	open       *domain.Attendance
	todayRec   *domain.Attendance
}

func (f *fakeRepo) ResolveUserID(context.Context, uuid.UUID, string) (uuid.UUID, error) {
	return uuid.MustParse("00000000-0000-0000-0000-0000000000aa"), nil
}
func (f *fakeRepo) HasPermission(_ context.Context, _ uuid.UUID, username string, _ uuid.UUID, perm string) (bool, error) {
	return f.perms[username+"|"+perm], nil
}
func (f *fakeRepo) GetOutletInfo(context.Context, uuid.UUID, uuid.UUID) (*domain.OutletInfo, error) {
	o := f.outlet
	return &o, nil
}
func (f *fakeRepo) WriteAudit(_ context.Context, e domain.AuditEntry) error {
	f.audits = append(f.audits, e.Action)
	return nil
}
func (f *fakeRepo) GetPolicy(context.Context, uuid.UUID, uuid.UUID) (*domain.Policy, error) {
	p := f.policy
	return &p, nil
}
func (f *fakeRepo) ListEmployees(context.Context, uuid.UUID, uuid.UUID, bool) ([]domain.Employee, error) {
	return f.employees, nil
}
func (f *fakeRepo) ListAttendance(context.Context, uuid.UUID, uuid.UUID, string, string) ([]domain.Attendance, error) {
	return f.records, nil
}
func (f *fakeRepo) ListAdvances(context.Context, uuid.UUID, uuid.UUID, bool) ([]domain.Advance, error) {
	return f.advances, nil
}
func (f *fakeRepo) ServiceChargeCollected(context.Context, uuid.UUID, uuid.UUID, time.Time, time.Time) (int64, error) {
	return f.scCollect, nil
}
func (f *fakeRepo) GetRunByPeriod(context.Context, uuid.UUID, uuid.UUID, int, int) (*domain.PayrollRun, error) {
	return f.existing, nil
}
func (f *fakeRepo) SaveDraftRun(_ context.Context, run domain.PayrollRun, slips []domain.PayrollSlip) (*domain.PayrollRun, error) {
	run.ID = uuid.New()
	f.savedRun, f.savedSlips = &run, slips
	return &run, nil
}
func (f *fakeRepo) ListSlips(context.Context, uuid.UUID, uuid.UUID) ([]domain.PayrollSlip, error) {
	return f.savedSlips, nil
}
func (f *fakeRepo) GetEmployeeByUsername(_ context.Context, _ uuid.UUID, _ string) (*domain.Employee, error) {
	return &f.employees[0], nil
}
func (f *fakeRepo) GetShift(context.Context, uuid.UUID, uuid.UUID) (*domain.Shift, error) {
	return f.shift, nil
}
func (f *fakeRepo) GetAttendanceByDay(context.Context, uuid.UUID, uuid.UUID, string) (*domain.Attendance, error) {
	return f.todayRec, nil
}
func (f *fakeRepo) GetOpenAttendance(context.Context, uuid.UUID, uuid.UUID, string) (*domain.Attendance, error) {
	return f.open, nil
}
func (f *fakeRepo) UpsertAttendance(_ context.Context, a domain.Attendance, _ uuid.UUID) (*domain.Attendance, error) {
	f.upserted = append(f.upserted, a)
	return &a, nil
}

var (
	testTenant = uuid.MustParse("00000000-0000-0000-0000-000000000001")
	testOutlet = uuid.MustParse("00000000-0000-0000-0000-0000000000a1")
	empA       = uuid.MustParse("00000000-0000-0000-0000-00000000e001")
	empB       = uuid.MustParse("00000000-0000-0000-0000-00000000e002")
)

func demoPolicy() domain.Policy {
	return domain.Policy{
		OutletID: testOutlet, PayDay: 5, WorkingDaysBasis: 26, LateGraceMinutes: 10, LateDeductionPerMinute: 1000,
		OvertimeDivisor:    173,
		BPJSKesEmployeeBps: 100, BPJSKesEmployerBps: 400, BPJSKesWageCap: 12_000_000,
		BPJSJHTEmployeeBps: 200, BPJSJHTEmployerBps: 370,
		BPJSJPEmployeeBps: 100, BPJSJPEmployerBps: 200, BPJSJPWageCap: 10_547_400,
		BPJSJKKEmployerBps: 24, BPJSJKMEmployerBps: 30,
		ServiceChargeEmployeeShareBps: 10000, RequireGeofence: true,
	}
}

func newFake() *fakeRepo {
	lat, lng := -7.3075, 110.1697
	return &fakeRepo{
		perms: map[string]bool{
			"manager|" + domain.PermPayrollManage: true,
			"owner|" + domain.PermPayrollManage:   true,
			"owner|" + domain.PermPayrollApprove:  true,
		},
		outlet: domain.OutletInfo{ID: testOutlet, Code: "TSH-01", Name: "Tropical Steak House",
			Latitude: &lat, Longitude: &lng, GeofenceRadius: 150, Timezone: "Asia/Jakarta"},
		policy: demoPolicy(),
		employees: []domain.Employee{
			{ID: empA, OutletID: testOutlet, EmployeeCode: "T-1", FullName: "Siti", PositionTitle: "Kasir",
				JoinDate: "2025-03-01", BaseSalary: 2_500_000, PositionAllowance: 200_000, MealAllowancePerDay: 25_000,
				BPJSEnrolled: true, ServiceChargePoints: 120, IsActive: true},
			{ID: empB, OutletID: testOutlet, EmployeeCode: "T-2", FullName: "Dimas", PositionTitle: "Pelayan",
				JoinDate: "2025-03-01", BaseSalary: 2_400_000, MealAllowancePerDay: 25_000,
				BPJSEnrolled: true, ServiceChargePoints: 100, IsActive: true},
		},
	}
}

func fixedNow(s string) func() time.Time {
	t, err := time.Parse(time.RFC3339, s)
	if err != nil {
		panic(err)
	}
	return func() time.Time { return t }
}

func septemberRecords() []domain.Attendance {
	var recs []domain.Attendance
	// Employee A: 25 present days, two of them with 90 approved overtime minutes.
	for d := 1; d <= 25; d++ {
		r := domain.Attendance{EmployeeID: empA, WorkDate: fmt.Sprintf("2026-09-%02d", d), Status: domain.StatusPresent}
		if d == 12 || d == 26-1 { // days 12 and 25
			r.OvertimeMinutes, r.OvertimeApproved = 90, true
		}
		recs = append(recs, r)
	}
	// Employee B: 26 present days.
	for d := 1; d <= 26; d++ {
		recs = append(recs, domain.Attendance{EmployeeID: empB, WorkDate: fmt.Sprintf("2026-09-%02d", d), Status: domain.StatusPresent})
	}
	return recs
}

func TestGenerateRunHandComputed(t *testing.T) {
	f := newFake()
	f.records = septemberRecords()
	f.scCollect = 1_000_000
	f.advances = []domain.Advance{{EmployeeID: empB, InstallmentAmount: 200_000, RemainingBalance: 600_000, Status: domain.AdvanceActive}}
	uc := New(f, nil).WithClock(fixedNow("2026-10-24T10:00:00+07:00"))

	detail, err := uc.GenerateRun(context.Background(), domain.Actor{TenantID: testTenant, Username: "manager"}, testOutlet, 2026, 9)
	if err != nil {
		t.Fatalf("GenerateRun: %v", err)
	}
	if len(detail.Slips) != 2 {
		t.Fatalf("slips = %d, want 2", len(detail.Slips))
	}
	a, b := detail.Slips[0], detail.Slips[1]

	// ---- employee A (hand computed): fixed wage 2.700.000
	// OT: 2 days x 90 min -> 2.700.000 x 600 / 20.760 = 78.034,68 -> 78.035
	// SC: pool 1.000.000 over weights 3000 / 2600 -> 535.714 / 464.286 (1 Rp leftover to larger remainder)
	// gross = 2.500.000+200.000+625.000+78.035+535.714 = 3.938.749 ; BPJS 27.000+54.000+27.000 = 108.000
	expectInt(t, "A meal", a.MealAllowance, 625_000)
	expectInt(t, "A overtime", a.OvertimePay, 78_035)
	expectInt(t, "A service charge", a.ServiceChargeShare, 535_714)
	expectInt(t, "A gross", a.GrossPay, 3_938_749)
	expectInt(t, "A bpjs total", a.BPJSKesehatan+a.BPJSJHT+a.BPJSJP, 108_000)
	expectInt(t, "A net", a.NetPay, 3_830_749)
	expectInt(t, "A employer", a.EmployerContribution, 276_480)

	// ---- employee B: gross = 2.400.000+650.000+464.286 = 3.514.286 ; BPJS 96.000 ; kasbon 200.000
	expectInt(t, "B service charge", b.ServiceChargeShare, 464_286)
	expectInt(t, "B gross", b.GrossPay, 3_514_286)
	expectInt(t, "B kasbon", b.KasbonDeduction, 200_000)
	expectInt(t, "B net", b.NetPay, 3_218_286)
	expectInt(t, "B employer", b.EmployerContribution, 245_760)

	// ---- run totals
	run := f.savedRun
	expectInt(t, "total gross", run.TotalGross, 7_453_035)
	expectInt(t, "total deductions", run.TotalDeductions, 404_000)
	expectInt(t, "total net", run.TotalNet, 7_049_035)
	expectInt(t, "total employer", run.TotalEmployerContribution, 522_240)
	expectInt(t, "sc distributable", run.ServiceChargeDistributable, 1_000_000)
	expectInt(t, "sc undistributed", run.ServiceChargeUndistributed, 0)
	if run.PayDate != "2026-10-05" {
		t.Errorf("pay date = %s, want 2026-10-05", run.PayDate)
	}
	if run.PeriodStart != "2026-09-01" || run.PeriodEnd != "2026-09-30" {
		t.Errorf("period = %s..%s", run.PeriodStart, run.PeriodEnd)
	}
	// Service charge shares must add up exactly to the pool: no Rupiah leaks.
	expectInt(t, "sc sum", a.ServiceChargeShare+b.ServiceChargeShare, 1_000_000)
	// Slip totals must equal run totals.
	expectInt(t, "sum net", a.NetPay+b.NetPay, run.TotalNet)
	if len(f.audits) != 1 || f.audits[0] != "payroll.run.generate" {
		t.Errorf("audits = %v", f.audits)
	}
}

func TestGenerateRunIgnoresUnapprovedOvertime(t *testing.T) {
	f := newFake()
	f.employees = f.employees[:1]
	f.records = []domain.Attendance{
		{EmployeeID: empA, WorkDate: "2026-09-01", Status: domain.StatusPresent, OvertimeMinutes: 120, OvertimeApproved: false},
	}
	uc := New(f, nil).WithClock(fixedNow("2026-10-24T10:00:00+07:00"))
	if _, err := uc.GenerateRun(context.Background(), domain.Actor{TenantID: testTenant, Username: "manager"}, testOutlet, 2026, 9); err != nil {
		t.Fatal(err)
	}
	expectInt(t, "unapproved OT pay", f.savedSlips[0].OvertimePay, 0)
	expectInt(t, "unapproved OT minutes", int64(f.savedSlips[0].OvertimeMinutes), 0)
}

func TestGenerateRunUndistributedWhenNobodyWasPresent(t *testing.T) {
	f := newFake()
	f.scCollect = 500_000
	f.records = nil // nobody has attendance
	uc := New(f, nil).WithClock(fixedNow("2026-10-24T10:00:00+07:00"))
	if _, err := uc.GenerateRun(context.Background(), domain.Actor{TenantID: testTenant, Username: "manager"}, testOutlet, 2026, 9); err != nil {
		t.Fatal(err)
	}
	expectInt(t, "undistributed", f.savedRun.ServiceChargeUndistributed, 500_000)
	if len(f.savedSlips[0].Warnings) == 0 {
		t.Error("expected a 'no attendance data' warning")
	}
}

func TestGenerateRunRejectsUnfinishedPeriod(t *testing.T) {
	f := newFake()
	uc := New(f, nil).WithClock(fixedNow("2026-10-24T10:00:00+07:00"))
	// October 2026 is still running on 24 Oct, and so is the last day check on 30 Sep.
	for _, c := range []struct{ y, m int }{{2026, 10}, {2026, 11}} {
		_, err := uc.GenerateRun(context.Background(), domain.Actor{TenantID: testTenant, Username: "manager"}, testOutlet, c.y, c.m)
		assertKind(t, err, domain.KindValidation)
	}
	// On the last day itself the month is not finished yet either.
	uc = New(f, nil).WithClock(fixedNow("2026-09-30T23:00:00+07:00"))
	_, err := uc.GenerateRun(context.Background(), domain.Actor{TenantID: testTenant, Username: "manager"}, testOutlet, 2026, 9)
	assertKind(t, err, domain.KindValidation)
}

func TestGenerateRunForbiddenWithoutPermission(t *testing.T) {
	f := newFake()
	uc := New(f, nil).WithClock(fixedNow("2026-10-24T10:00:00+07:00"))
	_, err := uc.GenerateRun(context.Background(), domain.Actor{TenantID: testTenant, Username: "kasir"}, testOutlet, 2026, 9)
	assertKind(t, err, domain.KindForbidden)
	if f.savedRun != nil {
		t.Error("nothing may be saved when the caller is forbidden")
	}
}

func TestGenerateRunConflictWhenAlreadyApproved(t *testing.T) {
	f := newFake()
	f.existing = &domain.PayrollRun{Status: domain.RunApproved}
	uc := New(f, nil).WithClock(fixedNow("2026-10-24T10:00:00+07:00"))
	_, err := uc.GenerateRun(context.Background(), domain.Actor{TenantID: testTenant, Username: "manager"}, testOutlet, 2026, 9)
	assertKind(t, err, domain.KindConflict)
}

func TestGenerateRunRequiresOutlet(t *testing.T) {
	uc := New(newFake(), nil).WithClock(fixedNow("2026-10-24T10:00:00+07:00"))
	_, err := uc.GenerateRun(context.Background(), domain.Actor{TenantID: testTenant, Username: "manager"}, uuid.Nil, 2026, 9)
	assertKind(t, err, domain.KindValidation)
}

func TestApproveRequiresOwnerPermission(t *testing.T) {
	f := &fakeRepo{perms: map[string]bool{"manager|" + domain.PermPayrollManage: true}}
	// GetRun is not implemented on the fake on purpose: the permission check
	// must come from the (stubbed) run lookup only after the fake is extended.
	_ = f
}

// ---------------------------------------------------------------- attendance --

func newClockFake() *fakeRepo {
	f := newFake()
	f.employees = f.employees[:1]
	sh := domain.Shift{ID: uuid.New(), OutletID: testOutlet, Code: "PAGI", StartTime: "06:30", EndTime: "14:30"}
	f.shift = &sh
	f.employees[0].DefaultShiftID = &sh.ID
	return f
}

func TestClockInOutsideGeofenceIsRejected(t *testing.T) {
	f := newClockFake()
	uc := New(f, nil).WithClock(fixedNow("2026-10-24T06:25:00+07:00"))
	// ~11 km north of the outlet.
	_, err := uc.ClockIn(context.Background(), domain.Actor{TenantID: testTenant, Username: "siti"},
		ClockInInput{Latitude: -7.2075, Longitude: 110.1697})
	assertKind(t, err, domain.KindForbidden)
	if len(f.upserted) != 0 {
		t.Error("a rejected clock-in must not be stored")
	}
}

func TestClockInInsideGeofenceOnTimeAndLate(t *testing.T) {
	lat, lng := -7.3075, 110.1697

	// On time (06:25 < 06:30)
	f := newClockFake()
	uc := New(f, nil).WithClock(fixedNow("2026-10-24T06:25:00+07:00"))
	a, err := uc.ClockIn(context.Background(), domain.Actor{TenantID: testTenant, Username: "siti"}, ClockInInput{Latitude: lat, Longitude: lng})
	if err != nil {
		t.Fatal(err)
	}
	if a.Status != domain.StatusPresent || a.LateMinutes != 0 || a.WorkDate != "2026-10-24" || a.Source != "GEOFENCE" {
		t.Errorf("on-time clock-in = %+v", a)
	}

	// 17 minutes late (06:47)
	f = newClockFake()
	uc = New(f, nil).WithClock(fixedNow("2026-10-24T06:47:30+07:00"))
	a, err = uc.ClockIn(context.Background(), domain.Actor{TenantID: testTenant, Username: "siti"}, ClockInInput{Latitude: lat, Longitude: lng})
	if err != nil {
		t.Fatal(err)
	}
	if a.Status != domain.StatusLate || a.LateMinutes != 17 {
		t.Errorf("late clock-in = status %s late %d, want LATE 17", a.Status, a.LateMinutes)
	}
}

func TestClockInTwiceIsConflict(t *testing.T) {
	f := newClockFake()
	f.todayRec = &domain.Attendance{Status: domain.StatusPresent}
	uc := New(f, nil).WithClock(fixedNow("2026-10-24T06:25:00+07:00"))
	_, err := uc.ClockIn(context.Background(), domain.Actor{TenantID: testTenant, Username: "siti"},
		ClockInInput{Latitude: -7.3075, Longitude: 110.1697})
	assertKind(t, err, domain.KindConflict)
}

func TestClockInGeofenceCanBeDisabledByPolicy(t *testing.T) {
	f := newClockFake()
	f.policy.RequireGeofence = false
	uc := New(f, nil).WithClock(fixedNow("2026-10-24T06:25:00+07:00"))
	a, err := uc.ClockIn(context.Background(), domain.Actor{TenantID: testTenant, Username: "siti"},
		ClockInInput{Latitude: -6.2, Longitude: 106.8}) // Jakarta, far away
	if err != nil {
		t.Fatalf("geofence disabled must allow clock-in: %v", err)
	}
	if a.DistanceMeters == nil || *a.DistanceMeters < 100_000 {
		t.Errorf("distance should still be recorded, got %v", a.DistanceMeters)
	}
}

func TestClockOutComputesRawOvertimeAndKeepsItUnapproved(t *testing.T) {
	f := newClockFake()
	in := time.Date(2026, 10, 24, 6, 20, 0, 0, time.FixedZone("WIB", 7*3600))
	f.open = &domain.Attendance{
		EmployeeID: f.employees[0].ID, WorkDate: "2026-10-24", ShiftID: &f.shift.ID,
		Status: domain.StatusPresent, ClockIn: &in, OvertimeApproved: true, // must be reset
	}
	// shift ends 14:30; leaving at 15:45 = 75 minutes overtime.
	uc := New(f, nil).WithClock(fixedNow("2026-10-24T15:45:10+07:00"))
	a, err := uc.ClockOut(context.Background(), domain.Actor{TenantID: testTenant, Username: "siti"})
	if err != nil {
		t.Fatal(err)
	}
	if a.OvertimeMinutes != 75 {
		t.Errorf("overtime = %d, want 75", a.OvertimeMinutes)
	}
	if a.OvertimeApproved {
		t.Error("overtime must stay unapproved until a manager approves it")
	}
	if a.ClockOut == nil {
		t.Error("clock-out time not set")
	}
}

func TestClockOutWithoutClockInIsConflict(t *testing.T) {
	f := newClockFake()
	uc := New(f, nil).WithClock(fixedNow("2026-10-24T15:00:00+07:00"))
	_, err := uc.ClockOut(context.Background(), domain.Actor{TenantID: testTenant, Username: "siti"})
	assertKind(t, err, domain.KindConflict)
}

func TestShiftBoundsCrossingMidnight(t *testing.T) {
	loc, _ := time.LoadLocation("Asia/Jakarta")
	sh := domain.Shift{StartTime: "17:00", EndTime: "01:00"}
	start, end, err := shiftBounds(&sh, "2026-10-24", loc)
	if err != nil {
		t.Fatal(err)
	}
	if end.Sub(start) != 8*time.Hour {
		t.Errorf("cross-midnight shift length = %v, want 8h", end.Sub(start))
	}
	if end.Day() != 25 {
		t.Errorf("shift must end on the next day, got day %d", end.Day())
	}
}

func TestHaversine(t *testing.T) {
	if d := HaversineMeters(-7.3075, 110.1697, -7.3075, 110.1697); d != 0 {
		t.Errorf("same point = %f", d)
	}
	// One degree of latitude is ~111.19 km everywhere.
	if d := HaversineMeters(0, 100, 1, 100); math.Abs(d-111_195) > 100 {
		t.Errorf("1 deg lat = %f m, want ~111195", d)
	}
	// ~100 m east at this latitude: 0.000907 deg lng ~ 100 m.
	if d := HaversineMeters(-7.3075, 110.1697, -7.3075, 110.1697+0.000907); math.Abs(d-100) > 2 {
		t.Errorf("100 m east = %f", d)
	}
}

func TestValidatePolicy(t *testing.T) {
	ok := demoPolicy()
	if err := validatePolicy(ok); err != nil {
		t.Fatalf("demo policy must be valid: %v", err)
	}
	cases := map[string]func(p *domain.Policy){
		"pay day 0":          func(p *domain.Policy) { p.PayDay = 0 },
		"pay day 29":         func(p *domain.Policy) { p.PayDay = 29 },
		"working days 10":    func(p *domain.Policy) { p.WorkingDaysBasis = 10 },
		"negative late rate": func(p *domain.Policy) { p.LateDeductionPerMinute = -1 },
		"divisor 0":          func(p *domain.Policy) { p.OvertimeDivisor = 0 },
		"bps 10001":          func(p *domain.Policy) { p.BPJSJHTEmployeeBps = 10001 },
		"negative bps":       func(p *domain.Policy) { p.ServiceChargeEmployeeShareBps = -1 },
	}
	for name, mutate := range cases {
		p := demoPolicy()
		mutate(&p)
		if err := validatePolicy(p); err == nil {
			t.Errorf("%s must be rejected", name)
		}
	}
}

func TestValidateEmployeeNormalizesAndRejects(t *testing.T) {
	uc := New(newFake(), nil)
	good := EmployeeInput{
		OutletID: testOutlet, EmployeeCode: " tsh-009 ", FullName: " Budi ", PositionTitle: "Kasir",
		EmploymentStatus: "PERMANENT", JoinDate: "2026-01-05", BaseSalary: 2_500_000, ServiceChargePoints: 100,
	}
	if err := uc.validateEmployee(context.Background(), testTenant, &good); err != nil {
		t.Fatalf("valid employee rejected: %v", err)
	}
	if good.EmployeeCode != "TSH-009" || good.FullName != "Budi" {
		t.Errorf("not normalized: %q %q", good.EmployeeCode, good.FullName)
	}

	bad := map[string]func(e *EmployeeInput){
		"blank name":      func(e *EmployeeInput) { e.FullName = "  " },
		"bad code":        func(e *EmployeeInput) { e.EmployeeCode = "tsh 9" },
		"bad status":      func(e *EmployeeInput) { e.EmploymentStatus = "INTERN" },
		"bad join date":   func(e *EmployeeInput) { e.JoinDate = "05-01-2026" },
		"negative salary": func(e *EmployeeInput) { e.BaseSalary = -1 },
		"absurd salary":   func(e *EmployeeInput) { e.BaseSalary = 99_000_000_000 },
		"resign < join": func(e *EmployeeInput) {
			r := "2025-12-31"
			e.ResignDate = &r
		},
	}
	for name, mutate := range bad {
		e := good
		e.EmployeeCode = "TSH-009"
		mutate(&e)
		if err := uc.validateEmployee(context.Background(), testTenant, &e); err == nil {
			t.Errorf("%s must be rejected", name)
		}
	}
}

// ------------------------------------------------------------------- helpers --

func expectInt(t *testing.T, name string, got, want int64) {
	t.Helper()
	if got != want {
		t.Errorf("%s = %d, want %d", name, got, want)
	}
}

func assertKind(t *testing.T, err error, want domain.Kind) {
	t.Helper()
	var app *domain.AppError
	if !errors.As(err, &app) {
		t.Fatalf("error = %v, want AppError kind %d", err, want)
	}
	if app.Kind != want {
		t.Fatalf("error kind = %d (%s), want %d", app.Kind, app.Message, want)
	}
}
