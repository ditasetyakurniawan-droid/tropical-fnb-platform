package currency_test

import (
	"testing"

	"tropical-fnb/backend/internal/platform/currency"
)

func TestCalculateTaxPB1(t *testing.T) {
	tests := []struct {
		name     string
		subtotal float64
		taxPct   float64
		expected float64
	}{
		{"Normal 10%", 173000, 10, 17300},
		{"Fractional subtotal rounds correctly", 88888, 10, 8889},
		{"Zero subtotal", 0, 10, 0},
		{"Zero tax percent", 100000, 0, 0},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := currency.CalculateTaxPB1(tt.subtotal, tt.taxPct)
			if got != tt.expected {
				t.Errorf("got %v, want %v", got, tt.expected)
			}
		})
	}
}

func TestSplitEvenly_ZeroLeakAccounting(t *testing.T) {
	// Rp 100.000 split across 3 people
	splits := currency.SplitEvenly(100000, 3)
	if len(splits) != 3 {
		t.Fatalf("expected 3 splits, got %d", len(splits))
	}

	sum := 0.0
	for _, s := range splits {
		sum += s
	}

	if sum != 100000 {
		t.Errorf("sum of splits %v != total 100000 (leak detected!)", sum)
	}

	// First should get 33334, others 33333
	if splits[0] != 33334 || splits[1] != 33333 || splits[2] != 33333 {
		t.Errorf("unexpected split distribution: %v", splits)
	}

	// 7 people splitting Rp 1.500.250
	splits7 := currency.SplitEvenly(1500250, 7)
	sum7 := 0.0
	for _, s := range splits7 {
		sum7 += s
	}
	if sum7 != 1500250 {
		t.Errorf("sum7 %v != total 1500250", sum7)
	}
}

func TestSplitByItems_ZeroLeakTaxDistribution(t *testing.T) {
	// Customer A: Rp 88.000 (Tenderloin Steak)
	// Customer B: Rp 35.000 (Ayam Bakar Madu)
	// Total Subtotal = 123.000 -> Tax 10% = 12.300 -> Total = 135.300
	subtotals := []float64{88000, 35000}
	results := currency.SplitByItems(subtotals, 10.0)

	totalFinal := 0.0
	totalTax := 0.0
	for _, r := range results {
		totalFinal += r.FinalTotal
		totalTax += r.TaxPB1
	}

	if totalTax != 12300 {
		t.Errorf("tax sum %v != 12300", totalTax)
	}
	if totalFinal != 135300 {
		t.Errorf("final sum %v != 135300", totalFinal)
	}
}
