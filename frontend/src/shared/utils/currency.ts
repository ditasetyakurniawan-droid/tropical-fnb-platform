// Enterprise currency formatting and zero-leak split billing math.

/**
 * Formats a number into Indonesian Rupiah (IDR).
 * Example: 88000 -> "Rp 88.000"
 */
export function formatIDR(amount: number): string {
  if (isNaN(amount) || amount === null || amount === undefined) {
    return 'Rp 0';
  }
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  }).format(Math.round(amount));
}

/**
 * Computes PB1 10% restaurant tax rounded to nearest integer Rupiah.
 */
export function calculateTaxPB1(subtotal: number, taxPercent = 10): number {
  if (subtotal <= 0 || taxPercent <= 0) return 0;
  return Math.round(subtotal * (taxPercent / 100));
}

/**
 * Splits an amount evenly across N persons with deterministic remainder distribution.
 * Guarantees that: sum(splits) === totalAmount (zero accounting leak).
 */
export function distributeSplitEvenly(totalAmount: number, numPersons: number): number[] {
  if (numPersons <= 0) return [];
  if (numPersons === 1) return [Math.round(totalAmount)];

  const totalInt = Math.round(totalAmount);
  const baseShare = Math.floor(totalInt / numPersons);
  const remainder = totalInt % numPersons;

  const splits: number[] = [];
  for (let i = 0; i < numPersons; i++) {
    splits.push(baseShare + (i < remainder ? 1 : 0));
  }
  return splits;
}

export interface SplitByItemInput {
  payerName: string;
  itemSubtotal: number;
}

export interface SplitByItemOutput {
  payerName: string;
  subtotal: number;
  taxPB1: number;
  finalTotal: number;
}

/**
 * Distributes subtotal and PB1 tax proportionally across item shares.
 * Guarantees that: sum(finalTotal) === sum(subtotal) + totalTax.
 */
export function distributeSplitByItems(shares: SplitByItemInput[], taxPercent = 10): SplitByItemOutput[] {
  if (shares.length === 0) return [];

  const totalSubtotal = shares.reduce((acc, s) => acc + Math.round(s.itemSubtotal), 0);
  const totalTax = calculateTaxPB1(totalSubtotal, taxPercent);

  if (totalSubtotal <= 0) {
    return shares.map(s => ({
      payerName: s.payerName,
      subtotal: 0,
      taxPB1: 0,
      finalTotal: 0,
    }));
  }

  let allocatedTax = 0;
  let maxSubIdx = 0;
  let maxSub = -1;

  const results: SplitByItemOutput[] = shares.map((s, idx) => {
    const sub = Math.round(s.itemSubtotal);
    const propTax = Math.floor((sub / totalSubtotal) * totalTax);
    allocatedTax += propTax;

    if (sub > maxSub) {
      maxSub = sub;
      maxSubIdx = idx;
    }

    return {
      payerName: s.payerName,
      subtotal: sub,
      taxPB1: propTax,
      finalTotal: sub + propTax,
    };
  });

  // Remainder tax distributed to the largest payer share
  const taxRemainder = totalTax - allocatedTax;
  const target = results[maxSubIdx];
  if (taxRemainder !== 0 && target) {
    target.taxPB1 += taxRemainder;
    target.finalTotal += taxRemainder;
  }

  return results;
}
