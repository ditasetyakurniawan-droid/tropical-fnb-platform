package engine

import (
	"math/rand"
	"testing"
)

// demoPolicy mirrors the seeded default policy. The values are TEST inputs: the
// engine itself contains no business constants besides the OT multipliers.
func demoPolicy() Policy {
	return Policy{
		WorkingDaysBasis:       26,
		LateGraceMinutes:       10,
		LateDeductionPerMinute: 1000,
		OvertimeDivisor:        173,

		BPJSKesehatanEmployeeBps: 100,
		BPJSKesehatanEmployerBps: 400,
		BPJSKesehatanWageCap:     12_000_000,
		BPJSJHTEmployeeBps:       200,
		BPJSJHTEmployerBps:       370,
		BPJSJPEmployeeBps:        100,
		BPJSJPEmployerBps:        200,
		BPJSJPWageCap:            10_547_400,
		BPJSJKKEmployerBps:       24,
		BPJSJKMEmployerBps:       30,
	}
}

func TestRoundDiv(t *testing.T) {
	cases := []struct{ num, den, want int64 }{
		{10, 4, 3}, // 2.5 -> 3 (half up)
		{9, 4, 2},  // 2.25 -> 2
		{11, 4, 3}, // 2.75 -> 3
		{0, 7, 0},  // zero
		{5, 0, 0},  // invalid denominator is safe
		{-5, 3, 0}, // invalid numerator is safe
		{100, 1, 100},
	}
	for _, c := range cases {
		if got := roundDiv(c.num, c.den); got != c.want {
			t.Errorf("roundDiv(%d,%d)=%d want %d", c.num, c.den, got, c.want)
		}
	}
}

func TestOvertimePay(t *testing.T) {
	// wage 2.800.000 / 173 = 16.184,97 per hour.
	// 90 minutes: 60 x 1.5 + 30 x 2.0 = 90 + 60 = 150 "hour-minutes"
	// = 2.5 weighted hours -> 16.184,97 x 2.5 = 40.462,43 -> 40.462
	if got := OvertimePay(2_800_000, 173, []int{90}); got != 40_462 {
		t.Errorf("90 min OT = %d, want 40462", got)
	}
	// Exactly one hour: 1.5 x 16.184,97 = 24.277,46 -> 24.277
	if got := OvertimePay(2_800_000, 173, []int{60}); got != 24_277 {
		t.Errorf("60 min OT = %d, want 24277", got)
	}
	// 30 minutes: 0.5 x 1.5 x 16.184,97 = 12.138,73 -> 12.139
	if got := OvertimePay(2_800_000, 173, []int{30}); got != 12_139 {
		t.Errorf("30 min OT = %d, want 12139", got)
	}
	// The 1.5x tier restarts every day, so two 60-minute days = 2 x 1.5 hours.
	// 3 weighted hours x 16.184,97 = 48.554,91 -> 48.555 (rounded once at the end)
	if got := OvertimePay(2_800_000, 173, []int{60, 60}); got != 48_555 {
		t.Errorf("2x60 min OT = %d, want 48555", got)
	}
	// Invalid inputs yield zero, never a panic.
	for _, got := range []int64{
		OvertimePay(0, 173, []int{60}),
		OvertimePay(2_800_000, 0, []int{60}),
		OvertimePay(2_800_000, 173, nil),
		OvertimePay(2_800_000, 173, []int{0, -5}),
	} {
		if got != 0 {
			t.Errorf("invalid OT input = %d, want 0", got)
		}
	}
}

func TestEffectiveLateMinutes(t *testing.T) {
	// grace 10: 15 and 20 count in full, 5 and 10 are tolerated.
	if got := EffectiveLateMinutes([]int{15, 5, 20, 10}, 10); got != 35 {
		t.Errorf("effective late = %d, want 35", got)
	}
	if got := EffectiveLateMinutes(nil, 10); got != 0 {
		t.Errorf("no late = %d, want 0", got)
	}
}

// TestCalculateHandComputed is the golden payslip. Every number below was
// computed by hand, independently of the implementation.
func TestCalculateHandComputed(t *testing.T) {
	in := Input{
		BaseSalary:          2_500_000,
		PositionAllowance:   300_000,
		MealAllowancePerDay: 25_000,
		BPJSEnrolled:        true,
		Attendance: Attendance{
			DaysPresent:         24,
			DaysUnexcusedAbsent: 1,
			LateMinutes:         []int{15, 5, 20},
			OvertimeMinutes:     []int{90},
		},
		ServiceChargeShare: 150_000,
		KasbonDue:          100_000,
	}
	r := Calculate(demoPolicy(), in)

	want := map[string]struct{ got, want int64 }{
		"meal":             {r.MealAllowance, 600_000},    // 24 x 25.000
		"overtime":         {r.OvertimePay, 40_462},       // see TestOvertimePay
		"gross":            {r.Gross, 3_590_462},          // 2.500.000+300.000+600.000+40.462+150.000
		"late":             {r.LateDeduction, 35_000},     // (15+20) x 1.000
		"absence":          {r.AbsenceDeduction, 107_692}, // 2.800.000/26 = 107.692,3
		"bpjs kesehatan":   {r.BPJSKesehatan, 28_000},     // 1% x 2.800.000
		"bpjs jht":         {r.BPJSJHT, 56_000},           // 2%
		"bpjs jp":          {r.BPJSJP, 28_000},            // 1%
		"kasbon":           {r.KasbonDeduction, 100_000},
		"total deductions": {r.TotalDeductions, 354_692},       // 35.000+107.692+112.000+100.000
		"net":              {r.NetPay, 3_235_770},              // 3.590.462 - 354.692
		"employer kes":     {r.EmployerBPJSKesehatan, 112_000}, // 4%
		"employer jht":     {r.EmployerBPJSJHT, 103_600},       // 3,7%
		"employer jp":      {r.EmployerBPJSJP, 56_000},         // 2%
		"employer jkk":     {r.EmployerBPJSJKK, 6_720},         // 0,24%
		"employer jkm":     {r.EmployerBPJSJKM, 8_400},         // 0,30%
		"employer total":   {r.EmployerContribution, 286_720},  // 112.000+103.600+56.000+6.720+8.400
	}
	for name, c := range want {
		if c.got != c.want {
			t.Errorf("%s = %d, want %d", name, c.got, c.want)
		}
	}
	if r.EffectiveLateMinutes != 35 {
		t.Errorf("effective late minutes = %d, want 35", r.EffectiveLateMinutes)
	}
	if r.OvertimeMinutes != 90 {
		t.Errorf("overtime minutes = %d, want 90", r.OvertimeMinutes)
	}
	if len(r.Warnings) != 0 {
		t.Errorf("unexpected warnings: %v", r.Warnings)
	}
}

func TestCalculateBPJSCaps(t *testing.T) {
	// A high wage must be capped for Kesehatan (12.000.000) and JP (10.547.400),
	// while JHT has no cap.
	r := Calculate(demoPolicy(), Input{BaseSalary: 20_000_000, BPJSEnrolled: true})
	if r.BPJSKesehatan != 120_000 { // 1% x 12.000.000
		t.Errorf("kesehatan = %d, want 120000", r.BPJSKesehatan)
	}
	if r.BPJSJP != 105_474 { // 1% x 10.547.400
		t.Errorf("jp = %d, want 105474", r.BPJSJP)
	}
	if r.BPJSJHT != 400_000 { // 2% x 20.000.000 (no cap)
		t.Errorf("jht = %d, want 400000", r.BPJSJHT)
	}
}

func TestCalculateNotEnrolledHasNoBPJS(t *testing.T) {
	r := Calculate(demoPolicy(), Input{BaseSalary: 3_000_000, BPJSEnrolled: false})
	if r.BPJSKesehatan+r.BPJSJHT+r.BPJSJP+r.EmployerContribution != 0 {
		t.Errorf("non-enrolled employee must have zero BPJS: %+v", r)
	}
	if r.NetPay != 3_000_000 {
		t.Errorf("net = %d, want 3000000", r.NetPay)
	}
}

func TestCalculateKasbonNeverMakesNetNegative(t *testing.T) {
	// gross 1.000.000, no other deductions, kasbon due 1.500.000 -> capped.
	r := Calculate(demoPolicy(), Input{BaseSalary: 1_000_000, KasbonDue: 1_500_000})
	if r.KasbonDeduction != 1_000_000 {
		t.Errorf("kasbon = %d, want 1000000 (capped)", r.KasbonDeduction)
	}
	if r.NetPay != 0 {
		t.Errorf("net = %d, want 0", r.NetPay)
	}
	if len(r.Warnings) == 0 {
		t.Error("expected a warning when the kasbon installment is reduced")
	}
}

func TestCalculateAbsenceCappedAtFixedWage(t *testing.T) {
	// 40 absent days must not deduct more than the fixed wage.
	r := Calculate(demoPolicy(), Input{
		BaseSalary: 2_600_000,
		Attendance: Attendance{DaysUnexcusedAbsent: 40},
	})
	if r.AbsenceDeduction != 2_600_000 {
		t.Errorf("absence = %d, want 2600000 (capped)", r.AbsenceDeduction)
	}
}

func TestCalculateDeductionsExceedEarningsWarns(t *testing.T) {
	r := Calculate(demoPolicy(), Input{
		BaseSalary: 1_000_000,
		Attendance: Attendance{DaysUnexcusedAbsent: 26, LateMinutes: []int{600}},
	})
	if r.NetPay >= 0 {
		t.Fatalf("expected negative net, got %d", r.NetPay)
	}
	if len(r.Warnings) == 0 {
		t.Error("expected a warning for negative net pay")
	}
}

func TestAllocateServiceCharge(t *testing.T) {
	// Hand-computed: weights 2400/2000/3750 (sum 8150), pool 1.000.000.
	// floors 294.478 / 245.398 / 460.122 = 999.998 -> 2 Rupiah left.
	// fractions .527 / .773 / .699 -> the two largest (idx1, idx2) get +1.
	got := AllocateServiceCharge(1_000_000, []int64{2400, 2000, 3750})
	want := []int64{294_478, 245_399, 460_123}
	for i := range want {
		if got[i] != want[i] {
			t.Errorf("share[%d]=%d want %d", i, got[i], want[i])
		}
	}
}

func TestAllocateServiceChargeEdgeCases(t *testing.T) {
	if got := AllocateServiceCharge(0, []int64{1, 2}); got[0]+got[1] != 0 {
		t.Errorf("empty pool must allocate nothing: %v", got)
	}
	if got := AllocateServiceCharge(1000, []int64{0, 0}); got[0]+got[1] != 0 {
		t.Errorf("all-zero weights must allocate nothing: %v", got)
	}
	if got := AllocateServiceCharge(1000, nil); len(got) != 0 {
		t.Errorf("nil weights must return empty: %v", got)
	}
	// An employee with zero weight (never present) gets nothing.
	got := AllocateServiceCharge(1000, []int64{0, 100})
	if got[0] != 0 || got[1] != 1000 {
		t.Errorf("zero-weight employee must get 0: %v", got)
	}
	// Equal weights, indivisible pool: remainder goes to the lowest indexes.
	got = AllocateServiceCharge(100, []int64{1, 1, 1})
	if got[0] != 34 || got[1] != 33 || got[2] != 33 {
		t.Errorf("tie-break must favour lower index: %v", got)
	}
}

// TestAllocateServiceChargeNeverLeaksRupiah is a property test: for any pool and
// any weights the shares must sum to the pool exactly.
func TestAllocateServiceChargeNeverLeaksRupiah(t *testing.T) {
	rng := rand.New(rand.NewSource(42))
	for iter := 0; iter < 5000; iter++ {
		n := rng.Intn(15) + 1
		weights := make([]int64, n)
		var positive bool
		for i := range weights {
			weights[i] = int64(rng.Intn(5000))
			if weights[i] > 0 {
				positive = true
			}
		}
		pool := int64(rng.Intn(50_000_000))
		shares := AllocateServiceCharge(pool, weights)

		var sum int64
		for i, s := range shares {
			if s < 0 {
				t.Fatalf("negative share %d", s)
			}
			if weights[i] <= 0 && s != 0 {
				t.Fatalf("zero-weight employee got %d", s)
			}
			sum += s
		}
		if positive && sum != pool {
			t.Fatalf("iter %d: sum %d != pool %d (weights %v)", iter, sum, pool, weights)
		}
		if !positive && sum != 0 {
			t.Fatalf("iter %d: allocated %d with no weights", iter, sum)
		}
	}
}

// TestCalculateInvariants checks the accounting identities on random inputs.
func TestCalculateInvariants(t *testing.T) {
	rng := rand.New(rand.NewSource(7))
	p := demoPolicy()
	for iter := 0; iter < 5000; iter++ {
		lates := make([]int, rng.Intn(6))
		for i := range lates {
			lates[i] = rng.Intn(90)
		}
		ots := make([]int, rng.Intn(6))
		for i := range ots {
			ots[i] = rng.Intn(240)
		}
		in := Input{
			BaseSalary:          int64(1_000_000 + rng.Intn(15_000_000)),
			PositionAllowance:   int64(rng.Intn(2_000_000)),
			MealAllowancePerDay: int64(rng.Intn(60_000)),
			BPJSEnrolled:        rng.Intn(2) == 0,
			Attendance: Attendance{
				DaysPresent:         rng.Intn(31),
				DaysUnexcusedAbsent: rng.Intn(10),
				LateMinutes:         lates,
				OvertimeMinutes:     ots,
			},
			ServiceChargeShare: int64(rng.Intn(1_000_000)),
			KasbonDue:          int64(rng.Intn(2_000_000)),
		}
		r := Calculate(p, in)

		if r.Gross != r.BaseSalary+r.PositionAllowance+r.MealAllowance+r.OvertimePay+r.ServiceChargeShare {
			t.Fatalf("gross identity broken: %+v", r)
		}
		if r.TotalDeductions != r.LateDeduction+r.AbsenceDeduction+r.BPJSKesehatan+r.BPJSJHT+r.BPJSJP+r.KasbonDeduction {
			t.Fatalf("deduction identity broken: %+v", r)
		}
		if r.NetPay != r.Gross-r.TotalDeductions {
			t.Fatalf("net identity broken: %+v", r)
		}
		if r.KasbonDeduction > in.KasbonDue {
			t.Fatalf("kasbon %d exceeds due %d", r.KasbonDeduction, in.KasbonDue)
		}
		// Kasbon alone must never drive net below zero.
		other := r.TotalDeductions - r.KasbonDeduction
		if r.Gross-other >= 0 && r.NetPay < 0 {
			t.Fatalf("kasbon made net negative: %+v", r)
		}
	}
}

// Calculate must be deterministic: same input, same output.
func TestCalculateDeterministic(t *testing.T) {
	in := Input{
		BaseSalary: 2_750_000, PositionAllowance: 150_000, MealAllowancePerDay: 20_000, BPJSEnrolled: true,
		Attendance:         Attendance{DaysPresent: 25, LateMinutes: []int{12, 30}, OvertimeMinutes: []int{45, 130}},
		ServiceChargeShare: 87_654, KasbonDue: 50_000,
	}
	a := Calculate(demoPolicy(), in)
	b := Calculate(demoPolicy(), in)
	if a.NetPay != b.NetPay || a.Gross != b.Gross {
		t.Fatal("Calculate is not deterministic")
	}
}
