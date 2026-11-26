import { Decimal } from 'decimal.js';

import type { MarginDashboardRow } from './marginDashboard';

type PricedMarginRow = MarginDashboardRow & { marginPct: Decimal };

export interface MarginDashboardAnalytics {
  pricedCount: number;
  belowTargetCount: number;
  averageMarginPct?: Decimal;
  bestMarginRow?: PricedMarginRow;
  lowestMarginRow?: PricedMarginRow;
}

export function summarizeMarginDashboardRows(
  rows: MarginDashboardRow[],
  targetMarginPct: Decimal,
): MarginDashboardAnalytics {
  const pricedRows = rows.filter(
    (row): row is PricedMarginRow => row.marginPct !== undefined,
  );
  const totalMargin = pricedRows.reduce(
    (total, row) => total.plus(row.marginPct),
    new Decimal(0),
  );

  let bestMarginRow: PricedMarginRow | undefined;
  let lowestMarginRow: PricedMarginRow | undefined;
  let belowTargetCount = 0;

  for (const row of pricedRows) {
    if (row.marginPct.lt(targetMarginPct)) {
      belowTargetCount += 1;
    }
    if (!bestMarginRow || row.marginPct.gt(bestMarginRow.marginPct)) {
      bestMarginRow = row;
    }
    if (!lowestMarginRow || row.marginPct.lt(lowestMarginRow.marginPct)) {
      lowestMarginRow = row;
    }
  }

  return {
    pricedCount: pricedRows.length,
    belowTargetCount,
    averageMarginPct:
      pricedRows.length > 0 ? totalMargin.div(pricedRows.length) : undefined,
    bestMarginRow,
    lowestMarginRow,
  };
}
