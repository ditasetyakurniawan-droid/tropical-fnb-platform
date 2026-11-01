// Package engine provides high-precision financial and BOM calculation engines.
package engine

import (
	"fmt"
	"strings"

	"github.com/shopspring/decimal"
)

// Supported standard units
const (
	UnitKg      = "kg"
	UnitOns     = "ons"
	UnitGram    = "g"
	UnitMg      = "mg"
	UnitLiter   = "liter"
	UnitL       = "l"
	UnitMl      = "ml"
	UnitSdm     = "sdm"
	UnitSdt     = "sdt"
	UnitPortion = "porsi"
	UnitPcs     = "pcs"
	UnitButir   = "butir"
	UnitLembar  = "lembar"
	UnitSachet  = "sachet"
	UnitIkat    = "ikat"
	UnitBatang  = "batang"
	UnitBotol   = "botol"
	UnitKaleng  = "kaleng"
	UnitCup     = "cup"
	UnitPack    = "pack"
)

// CostBasis specifies how ingredient quantity and cost are evaluated.
type CostBasis string

const (
	CostBasisEPYielded CostBasis = "EP_YIELDED" // Edible Portion (Net) with yield adjustment
	CostBasisAPRaw     CostBasis = "AP_RAW"     // As Purchased (Gross Raw) without yield adjustment
)

// IncompatibleUoMError indicates units cannot be converted.
type IncompatibleUoMError struct {
	IngUnit  string
	ItemUnit string
	Reason   string
}

func (e *IncompatibleUoMError) Error() string {
	if e.Reason != "" {
		return fmt.Sprintf("satuan '%s' tidak kompatibel dengan '%s': %s", e.IngUnit, e.ItemUnit, e.Reason)
	}
	return fmt.Sprintf("satuan '%s' tidak kompatibel dengan satuan bahan baku '%s'", e.IngUnit, e.ItemUnit)
}

// NormalizeUnit normalizes human unit aliases into canonical lowercase identifiers.
func NormalizeUnit(raw string) string {
	u := strings.ToLower(strings.TrimSpace(raw))
	switch u {
	case "kilogram", "kgs":
		return "kg"
	case "gram", "gr", "grams":
		return "g"
	case "miligram":
		return "mg"
	case "liter", "ltr", "litre":
		return "l"
	case "mililiter", "cc":
		return "ml"
	case "tbsp", "sendok makan":
		return "sdm"
	case "tsp", "sendok teh":
		return "sdt"
	case "portion", "prs", "saji":
		return "porsi"
	case "buah", "biji", "pc", "piece", "pieces", "potong":
		return "pcs"
	case "slice", "helai":
		return "lembar"
	case "btg":
		return "batang"
	case "btl":
		return "botol"
	case "gelas":
		return "cup"
	case "bungkus", "pak":
		return "pack"
	default:
		return u
	}
}

func massUnitToGrams(u string) (decimal.Decimal, bool) {
	switch u {
	case "kg":
		return decimal.NewFromInt(1000), true
	case "ons":
		return decimal.NewFromInt(100), true
	case "g":
		return decimal.NewFromInt(1), true
	case "mg":
		return decimal.NewFromFloat(0.001), true
	default:
		return decimal.Zero, false
	}
}

func volumeUnitToMl(u string) (decimal.Decimal, bool) {
	switch u {
	case "l":
		return decimal.NewFromInt(1000), true
	case "ml":
		return decimal.NewFromInt(1), true
	case "sdm":
		return decimal.NewFromInt(15), true
	case "sdt":
		return decimal.NewFromInt(5), true
	default:
		return decimal.Zero, false
	}
}

// ConvertUoMFactor converts 1 unit of `fromUnit` to `toUnit`.
// e.g. fromUnit="g", toUnit="kg" returns factor 0.001 (since 1g = 0.001kg).
// If cross-dimension, outputUnit and conversionRatio are consulted.
func ConvertUoMFactor(fromUnit, toUnit string, yieldOutputUnit *string, yieldConversionRatio *float64) (decimal.Decimal, error) {
	from := NormalizeUnit(fromUnit)
	to := NormalizeUnit(toUnit)

	if from == "" || to == "" {
		return decimal.Zero, &IncompatibleUoMError{IngUnit: fromUnit, ItemUnit: toUnit, Reason: "satuan kosong"}
	}

	// Exact match (includes pcs, porsi, butir, lembar, sachet, ikat, batang, cup, botol, kaleng, pack)
	if from == to {
		return decimal.NewFromInt(1), nil
	}

	// Mass dimension: kg <-> ons <-> g <-> mg
	if fromGrams, okFrom := massUnitToGrams(from); okFrom {
		if toGrams, okTo := massUnitToGrams(to); okTo {
			return fromGrams.Div(toGrams), nil
		}
	}

	// Volume dimension: liter/l <-> ml <-> sdm <-> sdt
	if fromMl, okFrom := volumeUnitToMl(from); okFrom {
		if toMl, okTo := volumeUnitToMl(to); okTo {
			return fromMl.Div(toMl), nil
		}
	}

	// Cross-dimension extraction: e.g. raw item is "kg" (Jeruk), ingredient requests "ml" or "liter" (Sari Jeruk)
	if yieldOutputUnit != nil && yieldConversionRatio != nil && *yieldConversionRatio > 0 {
		targetOutput := NormalizeUnit(*yieldOutputUnit)
		ratioDec := decimal.NewFromFloat(*yieldConversionRatio)
		if ratioDec.IsZero() {
			return decimal.Zero, &IncompatibleUoMError{IngUnit: fromUnit, ItemUnit: toUnit, Reason: "rasio konversi nol"}
		}

		// Direct match with yieldOutputUnit (e.g. from="ml", targetOutput="ml")
		if from == targetOutput {
			return decimal.NewFromInt(1).Div(ratioDec), nil
		}

		// Compatible within same dimension as yieldOutputUnit (e.g. from="l" -> targetOutput="ml" -> raw "kg")
		if subFactor, err := ConvertUoMFactor(from, targetOutput, nil, nil); err == nil {
			return subFactor.Div(ratioDec), nil
		}
	}

	return decimal.Zero, &IncompatibleUoMError{IngUnit: fromUnit, ItemUnit: toUnit}
}

// CalculatePackBaseCost calculates cost_price per base unit from a bulk purchase package
// (e.g. 1 Bottle = 750 ml @ Rp 115.000 -> Rp 153.3333 / ml).
func CalculatePackBaseCost(packPrice, packQty float64) (float64, error) {
	if packPrice < 0 {
		return 0, fmt.Errorf("harga beli kemasan tidak boleh negatif")
	}
	if packQty <= 0 {
		return 0, fmt.Errorf("isi per kemasan harus lebih besar dari 0")
	}
	priceDec := decimal.NewFromFloat(packPrice)
	qtyDec := decimal.NewFromFloat(packQty)
	baseCost, _ := priceDec.Div(qtyDec).Round(4).Float64()
	return baseCost, nil
}

// CalculateEffectiveUnitCost calculates true cost per unit accounting for standard_yield_percent.
func CalculateEffectiveUnitCost(costPrice, standardYieldPercent float64) float64 {
	if costPrice <= 0 {
		return 0
	}
	yieldPct := standardYieldPercent
	if yieldPct <= 0 {
		yieldPct = 100.0
	}
	costDec := decimal.NewFromFloat(costPrice)
	yieldDec := decimal.NewFromFloat(yieldPct).Div(decimal.NewFromInt(100))
	eff, _ := costDec.Div(yieldDec).Round(4).Float64()
	return eff
}

// CalculateRecommendedSellingPrice computes exact and upward-thousand-rounded recommended selling prices
// given HPA and target food cost percentage (e.g. HPA Rp 30.000, Target FC 35% -> Exact Rp 85.714,29, Rounded Rp 86.000).
func CalculateRecommendedSellingPrice(hpa, targetFoodCostPct float64) (exactPrice float64, roundedThousand float64) {
	if hpa <= 0 || targetFoodCostPct <= 0 || targetFoodCostPct >= 100 {
		return 0, 0
	}
	hpaDec := decimal.NewFromFloat(hpa)
	fcRatio := decimal.NewFromFloat(targetFoodCostPct).Div(decimal.NewFromInt(100))
	exactDec := hpaDec.Div(fcRatio)
	exactPrice, _ = exactDec.Round(2).Float64()

	thousand := decimal.NewFromInt(1000)
	roundedDec := exactDec.Div(thousand).Ceil().Mul(thousand)
	roundedThousand, _ = roundedDec.Float64()
	return exactPrice, roundedThousand
}

// SuggestKitchenStation returns the recommended KDS station based on outlet code and menu type (FOOD, SNACK, BEVERAGE).
func SuggestKitchenStation(outletCode, menuType string) string {
	mType := strings.ToUpper(strings.TrimSpace(menuType))
	oCode := strings.ToUpper(strings.TrimSpace(outletCode))

	if oCode == "TGR-01" {
		switch mType {
		case "BEVERAGE":
			return "BAR_TRADISIONAL"
		case "SNACK":
			return "DAPUR_NUSANTARA"
		default:
			return "BAKARAN_GORENG"
		}
	}

	// Default / TSH-01 (Tropical Steak House) or consolidated group
	switch mType {
	case "BEVERAGE":
		return "BEVERAGE_BAR"
	case "SNACK":
		return "SIDES_PANTRY"
	default:
		return "GRILL_STEAK"
	}
}

// IngredientCalculationInput represents input parameters for an ingredient cost calculation.
type IngredientCalculationInput struct {
	CostBasis            CostBasis
	Quantity             float64 // Net quantity for EP, Gross quantity for AP
	IngredientUnit       string
	ItemUnit             string
	CostPrice            float64
	StandardYieldPercent float64
	YieldPercentApplied  float64
	YieldOutputUnit      *string
	YieldConversionRatio *float64
	IsSubRecipe          bool
}

// IngredientCalculationResult holds precision calculation output for one ingredient.
type IngredientCalculationResult struct {
	GrossQuantity       float64
	NetQuantity         float64
	YieldPercentApplied float64
	UnitCost            float64 // Cost per ingredient unit (IDR)
	SubtotalCost        float64 // Rounded to 2 decimals (IDR)
}

// CalculateIngredientCost calculates gross/net quantities, unit cost, and subtotal cost
// with financial precision (Zero Float Policy).
func CalculateIngredientCost(in IngredientCalculationInput) (*IngredientCalculationResult, error) {
	if in.Quantity <= 0 {
		return nil, fmt.Errorf("kuantitas bahan harus lebih besar dari 0")
	}

	factor, err := ConvertUoMFactor(in.IngredientUnit, in.ItemUnit, in.YieldOutputUnit, in.YieldConversionRatio)
	if err != nil {
		return nil, err
	}

	qtyDec := decimal.NewFromFloat(in.Quantity)
	costPriceDec := decimal.NewFromFloat(in.CostPrice)

	// If sub-recipe: cost is based on sub-recipe cost_per_portion (no yield trimming)
	if in.IsSubRecipe {
		unitCostDec := costPriceDec.Mul(factor)
		subtotalDec := qtyDec.Mul(unitCostDec)
		unitCost, _ := unitCostDec.Round(4).Float64()
		subtotal, _ := subtotalDec.Round(2).Float64()

		return &IngredientCalculationResult{
			GrossQuantity:       in.Quantity,
			NetQuantity:         in.Quantity,
			YieldPercentApplied: 100.0,
			UnitCost:            unitCost,
			SubtotalCost:        subtotal,
		}, nil
	}

	// Raw Inventory Item
	if in.CostBasis == CostBasisAPRaw {
		// User enters gross quantity purchased. Subtotal = grossQuantity * costPrice * factor
		unitCostDec := costPriceDec.Mul(factor)
		subtotalDec := qtyDec.Mul(unitCostDec)
		unitCost, _ := unitCostDec.Round(4).Float64()
		subtotal, _ := subtotalDec.Round(2).Float64()

		return &IngredientCalculationResult{
			GrossQuantity:       in.Quantity,
			NetQuantity:         in.Quantity,
			YieldPercentApplied: 100.0,
			UnitCost:            unitCost,
			SubtotalCost:        subtotal,
		}, nil
	}

	// EP_YIELDED: User enters net edible portion
	appliedYield := in.YieldPercentApplied
	if appliedYield <= 0 {
		if in.StandardYieldPercent > 0 {
			appliedYield = in.StandardYieldPercent
		} else {
			appliedYield = 100.0
		}
	}

	if appliedYield <= 0 {
		return nil, fmt.Errorf("yield percent applied harus lebih besar dari 0")
	}

	yieldDec := decimal.NewFromFloat(appliedYield).Div(decimal.NewFromInt(100))
	// Effective cost per raw unit = cost_price / (yield / 100)
	effectiveCostPerRawUnit := costPriceDec.Div(yieldDec)

	// Unit cost per ingredient unit = effectiveCostPerRawUnit * factor
	unitCostDec := effectiveCostPerRawUnit.Mul(factor)
	// Subtotal = netQuantity * unitCost
	subtotalDec := qtyDec.Mul(unitCostDec)
	// Gross quantity = netQuantity / (yield / 100)
	grossQtyDec := qtyDec.Div(yieldDec)

	unitCost, _ := unitCostDec.Round(4).Float64()
	subtotal, _ := subtotalDec.Round(2).Float64()
	grossQty, _ := grossQtyDec.Round(4).Float64()

	return &IngredientCalculationResult{
		GrossQuantity:       grossQty,
		NetQuantity:         in.Quantity,
		YieldPercentApplied: appliedYield,
		UnitCost:            unitCost,
		SubtotalCost:        subtotal,
	}, nil
}

// CalculateRecipeTotals sums ingredients and computes cost_per_portion.
func CalculateRecipeTotals(subtotals []float64, yieldPortions float64) (totalHPA float64, costPerPortion float64, err error) {
	if yieldPortions <= 0 {
		return 0, 0, fmt.Errorf("yield_portions harus lebih besar dari 0")
	}

	totalDec := decimal.Zero
	for _, s := range subtotals {
		totalDec = totalDec.Add(decimal.NewFromFloat(s))
	}

	portionsDec := decimal.NewFromFloat(yieldPortions)
	costPerPortionDec := totalDec.Div(portionsDec)

	totalHPA, _ = totalDec.Round(2).Float64()
	costPerPortion, _ = costPerPortionDec.Round(2).Float64()
	return totalHPA, costPerPortion, nil
}
