package engine_test

import (
	"errors"
	"math"
	"testing"

	"tropical-fnb/backend/internal/modules/menu/engine"
)

// Test 1: Tenderloin Steak (EP_YIELDED with true cost / yield adjustment)
// Whole Tenderloin @ Rp 135.000/kg, Yield 82%.
// Edible portion: 200g (0.2 kg).
// True cost = 135.000 / 0.82 = Rp 164.634,1463/kg.
// Subtotal = 0.2 * 164.634,1463 = Rp 32.926,83.
// Gross required = 0.2 / 0.82 = 0.2439 kg.
func TestCalculateIngredientCost_Tenderloin_EP_Yielded(t *testing.T) {
	input := engine.IngredientCalculationInput{
		CostBasis:            engine.CostBasisEPYielded,
		Quantity:             0.2000, // 200g = 0.2 kg
		IngredientUnit:       "kg",
		ItemUnit:             "kg",
		CostPrice:            135000.0,
		StandardYieldPercent: 82.0,
		YieldPercentApplied:  82.0,
		IsSubRecipe:          false,
	}

	res, err := engine.CalculateIngredientCost(input)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if math.Abs(res.UnitCost-164634.1463) > 0.01 {
		t.Errorf("expected unit cost ~164634.15, got %v", res.UnitCost)
	}

	if res.SubtotalCost != 32926.83 {
		t.Errorf("expected subtotal Rp 32926.83, got %v", res.SubtotalCost)
	}

	if math.Abs(res.GrossQuantity-0.2439) > 0.0001 {
		t.Errorf("expected gross qty 0.2439 kg, got %v", res.GrossQuantity)
	}

	if res.NetQuantity != 0.2000 {
		t.Errorf("expected net qty 0.2000, got %v", res.NetQuantity)
	}
}

// Test 1b: Tenderloin Steak entered in grams (200 g vs raw unit kg)
func TestCalculateIngredientCost_Tenderloin_Grams(t *testing.T) {
	input := engine.IngredientCalculationInput{
		CostBasis:            engine.CostBasisEPYielded,
		Quantity:             200.0, // 200g
		IngredientUnit:       "g",
		ItemUnit:             "kg",
		CostPrice:            135000.0,
		StandardYieldPercent: 82.0,
		YieldPercentApplied:  82.0,
		IsSubRecipe:          false,
	}

	res, err := engine.CalculateIngredientCost(input)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// Cost per gram = 164634.1463 * 0.001 = 164.6341
	if math.Abs(res.UnitCost-164.6341) > 0.01 {
		t.Errorf("expected unit cost per gram ~164.6341, got %v", res.UnitCost)
	}

	if res.SubtotalCost != 32926.83 {
		t.Errorf("expected subtotal Rp 32926.83, got %v", res.SubtotalCost)
	}

	if math.Abs(res.GrossQuantity-243.9024) > 0.01 {
		t.Errorf("expected gross qty ~243.9g, got %v", res.GrossQuantity)
	}
}

// Test 2: Gurame Goreng (AP_RAW gross whole fish)
// Whole Fish @ Rp 44.000/kg. Gross fish weight: 500g (0.5 kg).
// Subtotal = 0.5 * 44.000 = Rp 22.000,00.
func TestCalculateIngredientCost_Gurame_AP_Raw(t *testing.T) {
	input := engine.IngredientCalculationInput{
		CostBasis:            engine.CostBasisAPRaw,
		Quantity:             0.5000,
		IngredientUnit:       "kg",
		ItemUnit:             "kg",
		CostPrice:            44000.0,
		StandardYieldPercent: 100.0,
		YieldPercentApplied:  100.0,
		IsSubRecipe:          false,
	}

	res, err := engine.CalculateIngredientCost(input)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if res.UnitCost != 44000.0 {
		t.Errorf("expected unit cost 44000, got %v", res.UnitCost)
	}

	if res.SubtotalCost != 22000.0 {
		t.Errorf("expected subtotal Rp 22000.0, got %v", res.SubtotalCost)
	}

	if res.GrossQuantity != 0.5000 || res.NetQuantity != 0.5000 {
		t.Errorf("expected gross & net to both be 0.5000, got gross=%v net=%v", res.GrossQuantity, res.NetQuantity)
	}
}

// Test 3: Es Jeruk via Direct Ratio (Cross-Dimension: kg -> ml)
// Raw item: Jeruk Segar @ Rp 20.000/kg.
// 1 kg gives 440 ml juice (ratio = 440).
// Recipe requires 150 ml.
// Subtotal = 150 * (20.000 / 440) = Rp 6.818,18.
func TestCalculateIngredientCost_EsJeruk_DirectRatio(t *testing.T) {
	outputUnit := "ml"
	ratio := 440.0

	input := engine.IngredientCalculationInput{
		CostBasis:            engine.CostBasisEPYielded,
		Quantity:             150.0,
		IngredientUnit:       "ml",
		ItemUnit:             "kg",
		CostPrice:            20000.0,
		StandardYieldPercent: 100.0,
		YieldPercentApplied:  100.0,
		YieldOutputUnit:      &outputUnit,
		YieldConversionRatio: &ratio,
		IsSubRecipe:          false,
	}

	res, err := engine.CalculateIngredientCost(input)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// Cost per ml = 20000 / 440 = 45.4545
	if math.Abs(res.UnitCost-45.4545) > 0.01 {
		t.Errorf("expected unit cost ~45.4545, got %v", res.UnitCost)
	}

	if res.SubtotalCost != 6818.18 {
		t.Errorf("expected subtotal Rp 6818.18, got %v", res.SubtotalCost)
	}
}

// Test 4: Es Jeruk via Sub-Recipe (Tier 2 BOM: ml -> ml)
// Sub-recipe batch of 2000 ml @ Rp 90.909 -> Rp 45.4545 / ml.
// Dish requires 150 ml. Subtotal = 150 * 45.4545 = Rp 6.818,18.
func TestCalculateIngredientCost_EsJeruk_SubRecipe(t *testing.T) {
	input := engine.IngredientCalculationInput{
		CostBasis:      engine.CostBasisEPYielded,
		Quantity:       150.0,
		IngredientUnit: "ml",
		ItemUnit:       "ml",
		CostPrice:      45.4545, // cost_per_portion of sub-recipe
		IsSubRecipe:    true,
	}

	res, err := engine.CalculateIngredientCost(input)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if res.SubtotalCost != 6818.18 {
		t.Errorf("expected subtotal Rp 6818.18, got %v", res.SubtotalCost)
	}
}

// Test 5: Incompatible UoM rejection (kg -> liter without ratio)
func TestCalculateIngredientCost_InvalidUoM(t *testing.T) {
	input := engine.IngredientCalculationInput{
		CostBasis:      engine.CostBasisEPYielded,
		Quantity:       1.0,
		IngredientUnit: "liter",
		ItemUnit:       "kg",
		CostPrice:      50000.0,
		IsSubRecipe:    false,
	}

	_, err := engine.CalculateIngredientCost(input)
	if err == nil {
		t.Fatal("expected incompatible UoM error, got nil")
	}

	var uomErr *engine.IncompatibleUoMError
	if !errors.As(err, &uomErr) {
		t.Errorf("expected IncompatibleUoMError, got %T: %v", err, err)
	}
}

// Test 6: Recipe Totals with Zero Division Protection
func TestCalculateRecipeTotals_Validation(t *testing.T) {
	subtotals := []float64{32926.83, 2800.00, 1500.00, 4200.00}

	// Normal case: 1 portion
	tot, perPortion, err := engine.CalculateRecipeTotals(subtotals, 1.0)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if tot != 41426.83 {
		t.Errorf("expected total Rp 41426.83, got %v", tot)
	}
	if perPortion != 41426.83 {
		t.Errorf("expected per portion Rp 41426.83, got %v", perPortion)
	}

	// Division by zero case
	_, _, err = engine.CalculateRecipeTotals(subtotals, 0)
	if err == nil {
		t.Fatal("expected error for 0 yield portions, got nil")
	}
}

// Test 7: Human-friendly Multi-Unit Conversions (ons, sdm, sdt, lembar/slice)
func TestCalculateIngredientCost_HumanMultiUnits(t *testing.T) {
	// 2 sdm (30 ml) Kecap Manis from 1 liter @ Rp 30.000 -> Rp 900.00
	sdmRes, err := engine.CalculateIngredientCost(engine.IngredientCalculationInput{
		CostBasis:      engine.CostBasisAPRaw,
		Quantity:       2,
		IngredientUnit: "sdm",
		ItemUnit:       "liter",
		CostPrice:      30000,
	})
	if err != nil {
		t.Fatalf("unexpected error for sdm -> liter: %v", err)
	}
	if sdmRes.SubtotalCost != 900.00 {
		t.Errorf("expected Rp 900.00 for 2 sdm of Rp 30.000/liter, got %v", sdmRes.SubtotalCost)
	}

	// 2.5 ons (250 g) Ayam from 1 kg @ Rp 36.000 -> Rp 9.000,00
	onsRes, err := engine.CalculateIngredientCost(engine.IngredientCalculationInput{
		CostBasis:      engine.CostBasisAPRaw,
		Quantity:       2.5,
		IngredientUnit: "ons",
		ItemUnit:       "kg",
		CostPrice:      36000,
	})
	if err != nil {
		t.Fatalf("unexpected error for ons -> kg: %v", err)
	}
	if onsRes.SubtotalCost != 9000.00 {
		t.Errorf("expected Rp 9000.00 for 2.5 ons of Rp 36.000/kg, got %v", onsRes.SubtotalCost)
	}
}

// Test 8: Pack-to-Base Cost, Recommended Selling Price, and Smart KDS Station Suggestion
func TestPricingAndStationHelpers(t *testing.T) {
	// 1 Botol Sirup Vanilla (750 ml) @ Rp 115.000 -> Rp 153.3333 / ml
	baseCost, err := engine.CalculatePackBaseCost(115000, 750)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if baseCost != 153.3333 {
		t.Errorf("expected 153.3333/ml, got %v", baseCost)
	}

	// HPA Rp 30.000 with Target Food Cost 35% -> Exact Rp 85.714,29, Rounded Rp 86.000
	exact, rounded := engine.CalculateRecommendedSellingPrice(30000, 35)
	if exact != 85714.29 || rounded != 86000 {
		t.Errorf("expected exact=85714.29 rounded=86000, got exact=%v rounded=%v", exact, rounded)
	}

	if st := engine.SuggestKitchenStation("TSH-01", "SNACK"); st != "SIDES_PANTRY" {
		t.Errorf("expected SIDES_PANTRY for TSH-01 SNACK, got %s", st)
	}
	if st := engine.SuggestKitchenStation("TGR-01", "BEVERAGE"); st != "BAR_TRADISIONAL" {
		t.Errorf("expected BAR_TRADISIONAL for TGR-01 BEVERAGE, got %s", st)
	}
}
