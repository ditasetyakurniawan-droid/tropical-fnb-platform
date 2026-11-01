// Package currency provides deterministic, zero-leak financial math
// for F&B point-of-sale calculations, tax (PB1), discounts, and split bills.
package currency

import (
	"math"
)

// RoundIDR rounds a float64 to the nearest integer Rupiah.
func RoundIDR(amount float64) float64 {
	return math.Round(amount)
}

// CalculateTaxPB1 computes the 10% PB1 restaurant tax (Pajak Restoran)
// rounded to the nearest integer Rupiah.
func CalculateTaxPB1(subtotalAfterDiscount float64, taxPercent float64) float64 {
	if subtotalAfterDiscount <= 0 || taxPercent <= 0 {
		return 0
	}
	return math.Round(subtotalAfterDiscount * (taxPercent / 100.0))
}

// CalculateServiceCharge computes service charge rounded to nearest integer Rupiah.
func CalculateServiceCharge(subtotalAfterDiscount float64, servicePercent float64) float64 {
	if subtotalAfterDiscount <= 0 || servicePercent <= 0 {
		return 0
	}
	return math.Round(subtotalAfterDiscount * (servicePercent / 100.0))
}

// SplitEvenly splits a total amount evenly across N persons without losing or gaining
// a single rupiah due to division truncation.
//
// Example: Rp 100.000 split across 3 people
// Base = 33.333
// Remainder = 100.000 - (33.333 * 3) = 1
// Result: Person 1 gets 33.334, Person 2 gets 33.333, Person 3 gets 33.333.
// Sum = 100.000 (Exact match, zero accounting leak).
func SplitEvenly(totalAmount float64, numPersons int) []float64 {
	if numPersons <= 0 {
		return []float64{}
	}
	if numPersons == 1 {
		return []float64{totalAmount}
	}

	totalInt := int64(math.Round(totalAmount))
	baseInt := totalInt / int64(numPersons)
	remainder := totalInt % int64(numPersons)

	result := make([]float64, numPersons)
	for i := 0; i < numPersons; i++ {
		share := baseInt
		if int64(i) < remainder {
			share++
		}
		result[i] = float64(share)
	}

	return result
}

// ItemShare represents an item partition for by-item split billing.
type ItemShare struct {
	PayerIndex int
	Subtotal   float64
}

// SplitByItemsResult holds the computed split for a single payer.
type SplitByItemsResult struct {
	PayerIndex int
	Subtotal   float64
	TaxPB1     float64
	FinalTotal float64
}

// SplitByItems allocates subtotal and distributes PB1 tax proportionally
// with remainder adjustment to guarantee sum(splits) == totalOrder.
func SplitByItems(subtotals []float64, taxPercent float64) []SplitByItemsResult {
	n := len(subtotals)
	if n == 0 {
		return nil
	}

	totalSubtotal := 0.0
	for _, s := range subtotals {
		totalSubtotal += math.Round(s)
	}

	totalTax := CalculateTaxPB1(totalSubtotal, taxPercent)
	results := make([]SplitByItemsResult, n)

	if totalSubtotal <= 0 {
		for i := 0; i < n; i++ {
			results[i] = SplitByItemsResult{PayerIndex: i, Subtotal: 0, TaxPB1: 0, FinalTotal: 0}
		}
		return results
	}

	allocatedTaxSum := 0.0
	maxTaxIdx := 0
	maxSub := -1.0

	for i, sub := range subtotals {
		roundedSub := math.Round(sub)
		propTax := math.Floor((roundedSub / totalSubtotal) * totalTax)
		allocatedTaxSum += propTax

		results[i] = SplitByItemsResult{
			PayerIndex: i,
			Subtotal:   roundedSub,
			TaxPB1:     propTax,
			FinalTotal: roundedSub + propTax,
		}

		if roundedSub > maxSub {
			maxSub = roundedSub
			maxTaxIdx = i
		}
	}

	// Adjust remainder tax to the largest payer share so sum(tax) == totalTax exactly
	taxRemainder := totalTax - allocatedTaxSum
	if taxRemainder != 0 && maxTaxIdx < n {
		results[maxTaxIdx].TaxPB1 += taxRemainder
		results[maxTaxIdx].FinalTotal += taxRemainder
	}

	return results
}
