import { Decimal } from 'decimal.js';
import { describe, expect, it } from 'vitest';

import { summarizeMarginDashboardRows } from './marginAnalytics';
import type { MarginDashboardRow } from './marginDashboard';

const rows: MarginDashboardRow[] = [
  { recipeId: 'below', name: 'Below target', cost: new Decimal(10), marginPct: new Decimal(60) },
  { recipeId: 'met', name: 'Target met', cost: new Decimal(10), marginPct: new Decimal(80) },
  { recipeId: 'unpriced', name: 'Unpriced', cost: new Decimal(10) },
];

describe('summarizeMarginDashboardRows', () => {
  it('summarizes priced dishes and excludes unpriced dishes from the margins', () => {
    const summary = summarizeMarginDashboardRows(rows, new Decimal(70));

    expect(summary.pricedCount).toBe(2);
    expect(summary.belowTargetCount).toBe(1);
    expect(summary.averageMarginPct?.toString()).toBe('70');
    expect(summary.bestMarginRow?.recipeId).toBe('met');
    expect(summary.lowestMarginRow?.recipeId).toBe('below');
  });

  it('returns no margin metrics when every dish is unpriced', () => {
    const summary = summarizeMarginDashboardRows([rows[2]], new Decimal(70));

    expect(summary.pricedCount).toBe(0);
    expect(summary.belowTargetCount).toBe(0);
    expect(summary.averageMarginPct).toBeUndefined();
    expect(summary.bestMarginRow).toBeUndefined();
    expect(summary.lowestMarginRow).toBeUndefined();
  });
});
