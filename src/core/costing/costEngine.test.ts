import { Decimal } from 'decimal.js';
import { describe, expect, it } from 'vitest';

import {
  calculateRecipeCost,
  InvalidPackagingOnSubRecipeError,
  type RecipeCostInput,
} from './costEngine';

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
  channelIds: ['dine-in', 'delivery'],
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
  ],
  packaging: [
    {
      id: 'packaging-line',
      packagingId: 'container',
      name: 'Container',
      quantityPerPortion: '1',
      packPriceMinor: 2000,
      piecesPerPack: 100,
      appliesTo: 'selected',
      channelIds: ['delivery'],
    },
  ],
};

describe('recipe cost calculations', () => {
  it('keeps food cost separate and applies delivery-only packaging to delivery', () => {
    const result = calculateRecipeCost(recipe, '10', 2);

    expect(result.batchFoodCost.eq(new Decimal('11.6'))).toBe(true);
    expect(result.foodCostPerPortion.eq(new Decimal('5.8'))).toBe(true);
    expect(result.packagingCostByChannel['dine-in']?.eq(0)).toBe(true);
    expect(result.packagingCostByChannel.delivery?.eq(new Decimal('0.2'))).toBe(true);
    expect(result.breakdown).toHaveLength(1);
  });

  it('derives 4.50 per piece from a 450.00 pack of 100', () => {
    const [line] = recipe.packaging;
    expect(line).toBeDefined();
    const result = calculateRecipeCost(
      { ...recipe, packaging: [{ ...line!, packPriceMinor: 45000 }] },
      '0',
      2,
    );

    expect(result.packagingCostByChannel.delivery?.eq(new Decimal('4.5'))).toBe(true);
  });

  it.each([
    { packPriceMinor: 450, fractionDigits: 0 },
    { packPriceMinor: 450000, fractionDigits: 3 },
  ])('uses the currency scale for $fractionDigits-decimal currencies', ({ packPriceMinor, fractionDigits }) => {
    const [line] = recipe.packaging;
    expect(line).toBeDefined();
    const result = calculateRecipeCost(
      { ...recipe, packaging: [{ ...line!, packPriceMinor }] },
      '0',
      fractionDigits,
    );

    expect(result.packagingCostByChannel.delivery?.eq(new Decimal('4.5'))).toBe(true);
  });

  it('rejects packaging lines on sub-recipes', () => {
    expect(() =>
      calculateRecipeCost({ ...recipe, isSubRecipe: true }, '0', 2),
    ).toThrow(InvalidPackagingOnSubRecipeError);
  });
});
