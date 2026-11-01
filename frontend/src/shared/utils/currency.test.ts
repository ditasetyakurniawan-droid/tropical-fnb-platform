import { describe, expect, it } from 'vitest';
import { calculateTaxPB1, distributeSplitByItems, distributeSplitEvenly, formatIDR } from './currency';

describe('currency utilities & zero-leak split bill engine', () => {
  it('formats Indonesian Rupiah properly', () => {
    expect(formatIDR(88000)).toBe('Rp\u00a088.000');
    expect(formatIDR(0)).toBe('Rp\u00a00');
  });

  it('calculates PB1 10% tax accurately', () => {
    expect(calculateTaxPB1(173000, 10)).toBe(17300);
    expect(calculateTaxPB1(88888, 10)).toBe(8889);
    expect(calculateTaxPB1(0, 10)).toBe(0);
  });

  it('splits bills evenly with zero rupiah loss across odd numbers', () => {
    // Rp 100.000 split across 3 people
    const splits = distributeSplitEvenly(100000, 3);
    expect(splits).toHaveLength(3);
    const sum = splits.reduce((a, b) => a + b, 0);
    expect(sum).toBe(100000);
    expect(splits[0]).toBe(33334);
    expect(splits[1]).toBe(33333);
    expect(splits[2]).toBe(33333);

    // 7 people splitting Rp 1.500.250
    const splits7 = distributeSplitEvenly(1500250, 7);
    const sum7 = splits7.reduce((a, b) => a + b, 0);
    expect(sum7).toBe(1500250);
  });

  it('splits bills by items with exact proportional PB1 tax distribution', () => {
    const input = [
      { payerName: 'Orang A', itemSubtotal: 88000 },
      { payerName: 'Orang B', itemSubtotal: 35000 },
    ];
    const results = distributeSplitByItems(input, 10);
    expect(results).toHaveLength(2);

    const totalFinal = results.reduce((a, b) => a + b.finalTotal, 0);
    const totalTax = results.reduce((a, b) => a + b.taxPB1, 0);

    // Subtotal = 123.000, Tax = 12.300, Final = 135.300
    expect(totalTax).toBe(12300);
    expect(totalFinal).toBe(135300);
  });
});
