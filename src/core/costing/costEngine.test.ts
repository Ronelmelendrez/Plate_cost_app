import { Decimal } from 'decimal.js';
import { describe, expect, it } from 'vitest';

import { calculateRecipeCost, type RecipeCostInput } from './costEngine';

const recipe: RecipeCostInput = {
  id: 'dish',
  isSubRecipe: false,
  portions: 2,
  batchYieldQuantity: '2',
  batchYieldUnit: 'portion',
  laborMinutes: '30',
  laborRateMinor: 2000,
  overheadMode: 'flat',
  overheadValue: '0.25',
  items: [
    {
      id: 'ingredient-line',
      kind: 'ingredient',
      name: 'Flour',
      quantity: '80',
      unit: 'g',
      ingredient: {
        id: 'flour',
        name: 'Flour',
        purchaseUnit: 'g',
        purchaseQuantity: '800',
        purchasePriceMinor: 1000,
        usableYieldPct: '100',
        conversions: [],
      },
    },
    {
      id: 'packaging-line',
      kind: 'packaging',
      name: 'Container',
      quantity: '1',
      unit: 'piece',
      packaging: { id: 'container', name: 'Container', costMinor: 20 },
    },
  ],
};

describe('recipe cost calculations', () => {
  it('applies waste to batch ingredients and adds per-portion packaging, labor, and overhead', () => {
    const result = calculateRecipeCost(recipe, '10', 2);

    expect(result.batchCost.eq(new Decimal('12'))).toBe(true);
    expect(result.costPerPortion.eq(new Decimal('6'))).toBe(true);
    expect(result.costPerYieldUnit.eq(new Decimal('6'))).toBe(true);
  });

  it('reports per-portion line costs consistently, including packaging', () => {
    const result = calculateRecipeCost(recipe, '10', 2);

    expect(result.breakdown[0]?.costPerPortion.eq(new Decimal('0.55'))).toBe(true);
    expect(result.breakdown[1]?.costPerPortion.eq(new Decimal('0.2'))).toBe(true);
  });
});
