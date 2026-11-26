import { Decimal } from 'decimal.js';
import { describe, expect, it } from 'vitest';

import { filterMarginDashboardRows } from './marginFilters';
import type { MarginDashboardRow } from './marginDashboard';

const rows: MarginDashboardRow[] = [
  { recipeId: 'below', name: 'Below', cost: new Decimal(10), marginPct: new Decimal('64.9') },
  { recipeId: 'met', name: 'Met', cost: new Decimal(10), marginPct: new Decimal(65) },
  { recipeId: 'unpriced', name: 'Unpriced', cost: new Decimal(10) },
];

describe('filterMarginDashboardRows', () => {
  it('keeps every dish in the all filter, including unpriced dishes', () => {
    expect(filterMarginDashboardRows(rows, 'all', new Decimal(65))).toEqual(rows);
  });

  it('uses the selected target as the exact boundary and omits unpriced dishes', () => {
    expect(filterMarginDashboardRows(rows, 'below-target', new Decimal(65))).toEqual([rows[0]]);
    expect(filterMarginDashboardRows(rows, 'target-met', new Decimal(65))).toEqual([rows[1]]);
  });
});
