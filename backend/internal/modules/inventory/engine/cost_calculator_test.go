package engine_test

import (
	"testing"

	"tropical-fnb/backend/internal/modules/inventory/engine"
)

func TestCalculateMovingAverageCost(t *testing.T) {
	tests := []struct {
		name          string
		existingStock float64
		currentMac    float64
		receivedQty   float64
		receivedPrice float64
		expected      float64
	}{
		{
			name:          "Zero initial stock takes received price directly",
			existingStock: 0,
			currentMac:    0,
			receivedQty:   10,
			receivedPrice: 135000,
			expected:      135000,
		},
		{
			name:          "Weighted average of equal quantities",
			existingStock: 10,
			currentMac:    130000,
			receivedQty:   10,
			receivedPrice: 140000,
			expected:      135000,
		},
		{
			name:          "Weighted average with unequal quantities and fractional prices",
			existingStock: 25.5,
			currentMac:    135000,
			receivedQty:   9.85,
			receivedPrice: 142000,
			// (25.5 * 135000 + 9.85 * 142000) / (25.5 + 9.85)
			// = (3442500 + 1398700) / 35.35 = 4841200 / 35.35 = 136950.495... -> 136950.50
			expected: 136950.50,
		},
		{
			name:          "Zero received quantity keeps current MAC",
			existingStock: 15,
			currentMac:    120000,
			receivedQty:   0,
			receivedPrice: 130000,
			expected:      120000,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := engine.CalculateMovingAverageCost(tc.existingStock, tc.currentMac, tc.receivedQty, tc.receivedPrice)
			if got != tc.expected {
				t.Errorf("CalculateMovingAverageCost() = %v, want %v", got, tc.expected)
			}
		})
	}
}

func TestCalculateWeightVariance(t *testing.T) {
	// Ordered 10 kg, received 9.85 kg on scale -> -0.15 kg variance (-1.5%)
	varQty, varPct := engine.CalculateWeightVariance(10.0, 9.85)
	if varQty != -0.15 {
		t.Errorf("expected variance qty -0.15, got %v", varQty)
	}
	if varPct != -1.5 {
		t.Errorf("expected variance pct -1.5, got %v", varPct)
	}
}

func TestCalculateOpnameVariance(t *testing.T) {
	// System stock 11 kg, counted 10.5 kg -> variance -0.5 kg (-67,500 Rp at 135,000/kg)
	varQty, varCost := engine.CalculateOpnameVariance(11.0, 10.5, 135000.0)
	if varQty != -0.5 {
		t.Errorf("expected variance qty -0.5, got %v", varQty)
	}
	if varCost != -67500.0 {
		t.Errorf("expected variance cost -67500, got %v", varCost)
	}
}

func TestEvaluateMenuHpa(t *testing.T) {
	t.Run("Dynamic BOM Mode", func(t *testing.T) {
		eff, margin, fcPct, varAmt, varPct, isAlert := engine.EvaluateMenuHpa(88000, 47700, 52000, "DYNAMIC_BOM")
		if eff != 47700 {
			t.Errorf("expected effective HPA 47700, got %v", eff)
		}
		if margin != 40300 {
			t.Errorf("expected margin 40300, got %v", margin)
		}
		if fcPct != 54.2 {
			t.Errorf("expected food cost pct 54.2%%, got %v", fcPct)
		}
		if isAlert {
			t.Errorf("did not expect alert when dynamic HPA is below manual target")
		}
		_ = varAmt
		_ = varPct
	})

	t.Run("Manual Override Mode with Cost Blowout Alert", func(t *testing.T) {
		// Selling price 85000, actual dynamic cost 46500, management target 42000
		// 46500 > 42000 * 1.05 (44100) -> Alert!
		eff, margin, _, varAmt, varPct, isAlert := engine.EvaluateMenuHpa(85000, 46500, 42000, "MANUAL_OVERRIDE")
		if eff != 42000 {
			t.Errorf("expected effective HPA 42000, got %v", eff)
		}
		if margin != 43000 {
			t.Errorf("expected margin 43000, got %v", margin)
		}
		if varAmt != 4500 {
			t.Errorf("expected variance amount 4500, got %v", varAmt)
		}
		if varPct != 10.71 {
			t.Errorf("expected variance pct 10.71%%, got %v", varPct)
		}
		if !isAlert {
			t.Errorf("expected isAlert to be true because dynamic cost is > 5%% over manual target")
		}
	})
}

func TestCalculateTransferVariance(t *testing.T) {
	t.Run("Zero variance when exact weight is received", func(t *testing.T) {
		varQty, varCost, isLoss := engine.CalculateTransferVariance(10.0, 10.0, 32000.0)
		if isLoss {
			t.Errorf("expected isLoss false, got true")
		}
		if varQty != 0 || varCost != 0 {
			t.Errorf("expected 0 variance, got qty=%v cost=%v", varQty, varCost)
		}
	})

	t.Run("Calculates transit shrinkage/spoilage loss correctly", func(t *testing.T) {
		// Dispatched 10 kg, received 9.8 kg, unit cost 32,000 IDR
		// Variance: 0.2 kg, Variance cost: 6,400 IDR
		varQty, varCost, isLoss := engine.CalculateTransferVariance(10.0, 9.8, 32000.0)
		if !isLoss {
			t.Errorf("expected isLoss true, got false")
		}
		if varQty != 0.2 {
			t.Errorf("expected variance qty 0.2, got %v", varQty)
		}
		if varCost != 6400.0 {
			t.Errorf("expected variance cost 6400, got %v", varCost)
		}
	})

	t.Run("Zero loss when received more than dispatched", func(t *testing.T) {
		varQty, varCost, isLoss := engine.CalculateTransferVariance(5.0, 5.2, 50000.0)
		if isLoss {
			t.Errorf("expected isLoss false when over-received, got true")
		}
		if varQty != 0 || varCost != 0 {
			t.Errorf("expected 0 variance loss, got qty=%v cost=%v", varQty, varCost)
		}
	})
}
