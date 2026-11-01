package engine

import (
	"math"
)

// CalculateMovingAverageCost evaluates the new weighted average unit cost
// upon receiving inventory from suppliers.
//
// Formula:
//
//	MAC_new = ( (Stock_old * MAC_old) + (Qty_received * Price_received) ) / ( Stock_old + Qty_received )
func CalculateMovingAverageCost(existingStock, currentMac, receivedQty, receivedPrice float64) float64 {
	if receivedQty <= 0 {
		return currentMac
	}
	if existingStock <= 0 {
		return math.Round(receivedPrice*100) / 100
	}
	totalWeight := existingStock + receivedQty
	if totalWeight <= 0 {
		return math.Round(receivedPrice*100) / 100
	}

	totalValue := (existingStock * currentMac) + (receivedQty * receivedPrice)
	newMac := totalValue / totalWeight
	return math.Round(newMac*100) / 100
}

// CalculateWeightVariance computes actual physical weight vs billed invoice weight.
func CalculateWeightVariance(billedQty, actualWeightQty float64) (varianceQty float64, variancePct float64) {
	varianceQty = math.Round((actualWeightQty-billedQty)*10000) / 10000
	if billedQty > 0 {
		variancePct = math.Round(((actualWeightQty-billedQty)/billedQty)*10000) / 100
	}
	return varianceQty, variancePct
}

// CalculateOpnameVariance calculates difference between physical counted stock and system theoretical stock.
func CalculateOpnameVariance(theoreticalQty, physicalQty, unitCost float64) (varianceQty float64, varianceCost float64) {
	varianceQty = math.Round((physicalQty-theoreticalQty)*10000) / 10000
	varianceCost = math.Round((varianceQty*unitCost)*100) / 100
	return varianceQty, varianceCost
}

// EvaluateMenuHpa calculates margins, food cost percentages, and flags potential
// cost blowouts (variance alert) when actual dynamic BOM cost exceeds management manual target.
func EvaluateMenuHpa(sellingPrice, dynamicBomHpa, manualHpa float64, mode string) (
	effectiveHpa float64,
	grossMargin float64,
	foodCostPct float64,
	varianceAmount float64,
	variancePct float64,
	isAlert bool,
) {
	if mode == "MANUAL_OVERRIDE" && manualHpa > 0 {
		effectiveHpa = manualHpa
	} else {
		effectiveHpa = dynamicBomHpa
	}

	grossMargin = math.Round((sellingPrice-effectiveHpa)*100) / 100
	if sellingPrice > 0 {
		foodCostPct = math.Round((effectiveHpa/sellingPrice)*10000) / 100
	}

	if manualHpa > 0 {
		varianceAmount = math.Round((dynamicBomHpa-manualHpa)*100) / 100
		variancePct = math.Round((varianceAmount/manualHpa)*10000) / 100
		// Flag alert if actual dynamic BOM cost is more than 5% higher than management target
		if dynamicBomHpa > (manualHpa * 1.05) {
			isAlert = true
		}
	}

	return effectiveHpa, grossMargin, foodCostPct, varianceAmount, variancePct, isAlert
}

// CalculateTransferVariance calculates variance weight and monetary loss during inter-branch or intra-branch transit.
func CalculateTransferVariance(dispatchedQty, receivedQty, unitCost float64) (varianceQty float64, varianceCost float64, isLoss bool) {
	if dispatchedQty > receivedQty {
		varianceQty = math.Round((dispatchedQty-receivedQty)*10000) / 10000
		varianceCost = math.Round((varianceQty*unitCost)*100) / 100
		isLoss = true
		return varianceQty, varianceCost, isLoss
	}
	return 0, 0, false
}
