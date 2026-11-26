import { Decimal } from 'decimal.js';

import type { MarginDashboardRow } from './marginDashboard';

export type MarginDashboardFilter = 'all' | 'below-target' | 'target-met';

export function filterMarginDashboardRows(
  rows: MarginDashboardRow[],
  filter: MarginDashboardFilter,
  targetMarginPct: Decimal,
) {
  if (filter === 'all') {
    return rows;
  }

  return rows.filter((row) => {
    if (row.marginPct === undefined) {
      return false;
    }
    return filter === 'below-target'
      ? row.marginPct.lt(targetMarginPct)
      : row.marginPct.gte(targetMarginPct);
  });
}
