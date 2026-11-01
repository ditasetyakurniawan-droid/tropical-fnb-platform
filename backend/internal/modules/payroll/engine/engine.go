// Package engine is the pure payroll calculator for Tropical F&B.
//
// Design rules (see docs/adr/0005-payroll-conventions.md):
//
//   - NO floating point anywhere. Money is int64 Rupiah, percentages are basis
//     points (1 bps = 0.01%, so 10% = 1000 bps), time is int minutes.
//   - Every division goes through roundDiv (round half up) so the same input
//     always yields the same Rupiah, on any machine.
//   - Distributing a pool uses the largest-remainder method so that
//     sum(shares) == pool exactly; no Rupiah is created or lost.
//   - The package has no I/O. Every business parameter arrives through Policy,
//     which is stored in the database and editable by the owner, never
//     hardcoded here.
package engine

// Policy holds every tunable parameter of the payroll calculation. All values
// come from the payroll_policies table.
type Policy struct {
	// WorkingDaysBasis is the number of working days a month is divided into
	// when valuing one unexcused absence day (e.g. 26).
	WorkingDaysBasis int
	// LateGraceMinutes: a single late arrival of at most this many minutes is
	// tolerated. Once exceeded, ALL minutes of that arrival are deducted.
	LateGraceMinutes int
	// LateDeductionPerMinute is the Rupiah deducted per effective late minute.
	LateDeductionPerMinute int64
	// OvertimeDivisor converts a monthly wage to an hourly wage
	// (1/173 of monthly wage, Kepmenakertrans 102/MEN/VI/2004).
	OvertimeDivisor int64

	BPJSKesehatanEmployeeBps int
	BPJSKesehatanEmployerBps int
	BPJSKesehatanWageCap     int64 // 0 = no cap
	BPJSJHTEmployeeBps       int
	BPJSJHTEmployerBps       int
	BPJSJPEmployeeBps        int
	BPJSJPEmployerBps        int
	BPJSJPWageCap            int64 // 0 = no cap
	BPJSJKKEmployerBps       int
	BPJSJKMEmployerBps       int
}

// Attendance is the monthly attendance summary of one employee.
type Attendance struct {
	// DaysPresent counts days the employee was physically present (on time or
	// late). Only these days earn the meal allowance.
	DaysPresent int
	// DaysUnexcusedAbsent counts ABSENT days (leave, sick and off days are not
	// deducted).
	DaysUnexcusedAbsent int
	// LateMinutes holds the raw late minutes of each late arrival.
	LateMinutes []int
	// OvertimeMinutes holds the manager-APPROVED overtime minutes of each day.
	// The first hour of a day is paid at 1.5x, the following hours at 2x.
	OvertimeMinutes []int
}

// Input is everything needed to compute one payslip.
type Input struct {
	BaseSalary          int64
	PositionAllowance   int64
	MealAllowancePerDay int64
	BPJSEnrolled        bool
	Attendance          Attendance
	// ServiceChargeShare is this employee's share of the outlet pool, already
	// allocated by AllocateServiceCharge.
	ServiceChargeShare int64
	// KasbonDue is the sum of installments due this month (already limited by
	// each advance's remaining balance).
	KasbonDue int64
}

// Result is a fully computed payslip. Invariants (verified by tests and by a
// database CHECK constraint):
//
//	Gross           = Base + PositionAllowance + MealAllowance + OvertimePay + ServiceChargeShare
//	TotalDeductions = Late + Absence + BPJSKesehatan + BPJSJHT + BPJSJP + Kasbon
//	NetPay          = Gross - TotalDeductions
type Result struct {
	BaseSalary         int64
	PositionAllowance  int64
	MealAllowance      int64
	OvertimePay        int64
	ServiceChargeShare int64
	Gross              int64

	LateDeduction    int64
	AbsenceDeduction int64
	BPJSKesehatan    int64
	BPJSJHT          int64
	BPJSJP           int64
	KasbonDeduction  int64
	TotalDeductions  int64

	NetPay int64

	// Employer-side BPJS contributions: not deducted from the employee but part
	// of the real cost of labour.
	EmployerBPJSKesehatan int64
	EmployerBPJSJHT       int64
	EmployerBPJSJP        int64
	EmployerBPJSJKK       int64
	EmployerBPJSJKM       int64
	EmployerContribution  int64

	EffectiveLateMinutes int
	OvertimeMinutes      int
	Warnings             []string
}

// Overtime multipliers, expressed x2 so the arithmetic stays in integers:
// 1.5x -> 3, 2x -> 4. Source: Kepmenakertrans 102/MEN/VI/2004 (working day).
const (
	overtimeFirstHourMinutes = 60
	overtimeFirstHourX2      = 3
	overtimeNextHoursX2      = 4
)

// roundDiv returns num/den rounded half up. num must be >= 0 and den > 0;
// otherwise it returns 0 (callers validate; the engine never panics).
func roundDiv(num, den int64) int64 {
	if den <= 0 || num < 0 {
		return 0
	}
	return (num + den/2) / den
}

// mulBps returns amount * bps / 10000, rounded half up.
func mulBps(amount int64, bps int) int64 {
	if amount <= 0 || bps <= 0 {
		return 0
	}
	return roundDiv(amount*int64(bps), 10000)
}

func minInt64(a, b int64) int64 {
	if a < b {
		return a
	}
	return b
}

// capped returns wage limited by cap (cap <= 0 means no cap).
func capped(wage, cap int64) int64 {
	if cap > 0 && wage > cap {
		return cap
	}
	return wage
}

// OvertimePay values the given per-day approved overtime minutes.
//
//	hourly   = monthlyWage / divisor
//	per day  = hourly * (1.5 * min(m,60) + 2.0 * max(m-60,0)) / 60
//
// Summed over days FIRST and rounded ONCE at the end, so the result does not
// depend on how many days are summed.
func OvertimePay(monthlyWage int64, divisor int64, dailyMinutes []int) int64 {
	if monthlyWage <= 0 || divisor <= 0 {
		return 0
	}
	var weightedX2 int64 // sum of (multiplier*2 * minutes)
	for _, m := range dailyMinutes {
		if m <= 0 {
			continue
		}
		first := minInt64(int64(m), overtimeFirstHourMinutes)
		rest := int64(m) - first
		weightedX2 += overtimeFirstHourX2*first + overtimeNextHoursX2*rest
	}
	// pay = wage/divisor * weightedX2/2 / 60
	return roundDiv(monthlyWage*weightedX2, divisor*60*2)
}

// EffectiveLateMinutes applies the grace rule: an arrival is deductible only if
// it is later than the grace period, and then all of its minutes count.
func EffectiveLateMinutes(lateMinutes []int, graceMinutes int) int {
	total := 0
	for _, m := range lateMinutes {
		if m > graceMinutes {
			total += m
		}
	}
	return total
}

// Calculate computes one payslip. It is deterministic and side-effect free.
func Calculate(p Policy, in Input) Result {
	var r Result
	r.BaseSalary = in.BaseSalary
	r.PositionAllowance = in.PositionAllowance

	fixedWage := in.BaseSalary + in.PositionAllowance // "upah tetap": base for OT, absence and BPJS

	// ----- earnings
	if in.Attendance.DaysPresent > 0 && in.MealAllowancePerDay > 0 {
		r.MealAllowance = int64(in.Attendance.DaysPresent) * in.MealAllowancePerDay
	}
	for _, m := range in.Attendance.OvertimeMinutes {
		if m > 0 {
			r.OvertimeMinutes += m
		}
	}
	r.OvertimePay = OvertimePay(fixedWage, p.OvertimeDivisor, in.Attendance.OvertimeMinutes)
	r.ServiceChargeShare = in.ServiceChargeShare
	r.Gross = r.BaseSalary + r.PositionAllowance + r.MealAllowance + r.OvertimePay + r.ServiceChargeShare

	// ----- deductions
	r.EffectiveLateMinutes = EffectiveLateMinutes(in.Attendance.LateMinutes, p.LateGraceMinutes)
	r.LateDeduction = int64(r.EffectiveLateMinutes) * p.LateDeductionPerMinute

	if in.Attendance.DaysUnexcusedAbsent > 0 && p.WorkingDaysBasis > 0 {
		perDay := roundDiv(fixedWage, int64(p.WorkingDaysBasis))
		r.AbsenceDeduction = minInt64(perDay*int64(in.Attendance.DaysUnexcusedAbsent), fixedWage)
	}

	if in.BPJSEnrolled {
		kesWage := capped(fixedWage, p.BPJSKesehatanWageCap)
		jpWage := capped(fixedWage, p.BPJSJPWageCap)

		r.BPJSKesehatan = mulBps(kesWage, p.BPJSKesehatanEmployeeBps)
		r.BPJSJHT = mulBps(fixedWage, p.BPJSJHTEmployeeBps)
		r.BPJSJP = mulBps(jpWage, p.BPJSJPEmployeeBps)

		r.EmployerBPJSKesehatan = mulBps(kesWage, p.BPJSKesehatanEmployerBps)
		r.EmployerBPJSJHT = mulBps(fixedWage, p.BPJSJHTEmployerBps)
		r.EmployerBPJSJP = mulBps(jpWage, p.BPJSJPEmployerBps)
		r.EmployerBPJSJKK = mulBps(fixedWage, p.BPJSJKKEmployerBps)
		r.EmployerBPJSJKM = mulBps(fixedWage, p.BPJSJKMEmployerBps)
		r.EmployerContribution = r.EmployerBPJSKesehatan + r.EmployerBPJSJHT + r.EmployerBPJSJP +
			r.EmployerBPJSJKK + r.EmployerBPJSJKM
	}

	// Kasbon is the LAST deduction and can never push take-home pay below zero:
	// it is limited to what is left after every other deduction.
	otherDeductions := r.LateDeduction + r.AbsenceDeduction + r.BPJSKesehatan + r.BPJSJHT + r.BPJSJP
	available := r.Gross - otherDeductions
	if available < 0 {
		available = 0
	}
	if in.KasbonDue > 0 {
		r.KasbonDeduction = minInt64(in.KasbonDue, available)
		if r.KasbonDeduction < in.KasbonDue {
			r.Warnings = append(r.Warnings, "Cicilan kasbon dikurangi karena gaji bersih tidak mencukupi")
		}
	}

	r.TotalDeductions = otherDeductions + r.KasbonDeduction
	r.NetPay = r.Gross - r.TotalDeductions
	if r.NetPay < 0 {
		r.Warnings = append(r.Warnings, "Total potongan melebihi pendapatan: tinjau absensi dan kebijakan potongan")
	}
	return r
}

// AllocateServiceCharge splits pool across employees in proportion to weights
// using the largest-remainder method.
//
//   - sum(result) == pool exactly (when at least one weight > 0).
//   - Ties on the fractional remainder go to the lower index, so callers must
//     pass employees in a stable order (e.g. by employee code).
//   - Employees with weight <= 0 receive 0.
//
// If every weight is zero the pool cannot be distributed and all shares are 0;
// the caller must surface the undistributed pool.
func AllocateServiceCharge(pool int64, weights []int64) []int64 {
	shares := make([]int64, len(weights))
	if pool <= 0 || len(weights) == 0 {
		return shares
	}
	var total int64
	for _, w := range weights {
		if w > 0 {
			total += w
		}
	}
	if total == 0 {
		return shares
	}

	remainders := make([]int64, len(weights))
	var allocated int64
	for i, w := range weights {
		if w <= 0 {
			continue
		}
		num := pool * w
		shares[i] = num / total
		remainders[i] = num % total
		allocated += shares[i]
	}

	leftover := pool - allocated // 0 <= leftover < number of positive weights
	for leftover > 0 {
		best := -1
		for i := range weights {
			if weights[i] <= 0 {
				continue
			}
			if best == -1 || remainders[i] > remainders[best] {
				best = i
			}
		}
		shares[best]++
		remainders[best] = -1 // each employee receives at most one extra Rupiah
		leftover--
	}
	return shares
}
