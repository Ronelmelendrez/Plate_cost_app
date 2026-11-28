import { describe, expect, it } from 'vitest';

import type { RecipeCostInput } from '@core/costing/costEngine';
import { buildMarginDashboardRows } from './marginDashboard';

function makeDish(id: string, name: string, items: RecipeCostInput['items']): RecipeCostInput {
  return {
    id,
    isSubRecipe: false,
    portions: 1,
    batchYieldQuantity: '1',
    batchYieldUnit: 'portion',
    laborMinutes: '0',
    laborRateMinor: 0,
    overheadMode: 'none',
    overheadValue: '0',
    channelIds: ['dine-in'],
    items,
    packaging: [],
  };
}

describe('buildMarginDashboardRows', () => {
  it('keeps valid margins and reports dishes with incompatible sub-recipe units', () => {
    const sauce: RecipeCostInput = {
      id: 'sauce',
      isSubRecipe: true,
      portions: 1,
      batchYieldQuantity: '500',
      batchYieldUnit: 'ml',
      laborMinutes: '0',
      laborRateMinor: 0,
      overheadMode: 'none',
      overheadValue: '0',
      channelIds: ['dine-in'],
      items: [],
      packaging: [],
    };
    const validDish = makeDish('valid-dish', 'Valid dish', [
      {
        id: 'flour-line',
        kind: 'ingredient',
        name: 'Flour',
        quantity: '100',
        unit: 'g',
        ingredient: {
          id: 'flour',
          name: 'Flour',
          purchaseUnit: 'g',
          purchaseQuantity: '1000',
          purchasePriceMinor: 1000,
          usableYieldPct: '100',
          conversions: [],
        },
      },
    ]);
    const invalidDish = makeDish('invalid-dish', 'Invalid dish', [
      {
        id: 'sauce-line',
        kind: 'recipe',
        name: 'Sauce',
        quantity: '100',
        unit: 'g',
        detail: sauce,
      },
    ]);
    const result = buildMarginDashboardRows(
      {
        recipes: [
          { id: 'valid-dish', name: 'Valid dish', isSubRecipe: false },
          { id: 'invalid-dish', name: 'Invalid dish', isSubRecipe: false },
          { id: 'sauce', name: 'Sauce', isSubRecipe: true },
        ],
        recipeCostInputs: [validDish, invalidDish, sauce],
        channels: [{ id: 'dine-in', commissionPct: '0', paymentFeePct: '0' }],
        channelPrices: [],
        wastePct: '0',
        unitSizes: { cupMl: '240', tablespoonMl: '15' },
        settings: {
          pricesIncludeTax: false,
          taxPct: '0',
          feesOnTaxIncludedPrice: false,
        },
      },
      'dine-in',
      2,
    );

    expect(result.rows.map((row) => row.recipeId)).toEqual(['valid-dish']);
    expect(result.invalidRecipes).toEqual([
      { recipeId: 'invalid-dish', name: 'Invalid dish' },
    ]);
  });
});
