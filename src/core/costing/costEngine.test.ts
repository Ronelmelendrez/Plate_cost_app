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

function createSauce(batchCostMinor: number): RecipeCostInput {
  return {
    ...recipe,
    id: 'sauce',
    isSubRecipe: true,
    portions: 1,
    batchYieldQuantity: '1000',
    batchYieldUnit: 'ml',
    laborMinutes: '0',
    laborRateMinor: 0,
    overheadMode: 'none',
    overheadValue: '0',
    items: [
      {
        id: 'sauce-ingredient-line',
        kind: 'ingredient',
        name: 'Sauce base',
        quantity: '1000',
        unit: 'ml',
        ingredient: {
          id: 'sauce-base',
          name: 'Sauce base',
          purchaseUnit: 'ml',
          purchaseQuantity: '1000',
          purchasePriceMinor: batchCostMinor,
          usableYieldPct: '100',
          conversions: [],
        },
      },
    ],
    packaging: [],
  };
}

function createDishUsingSauce(quantity: string, unit: 'L' | 'ml' | 'tbsp', batchCostMinor = 5) {
  return {
    ...recipe,
    id: 'sauce-dish',
    isSubRecipe: false,
    portions: 1,
    batchYieldQuantity: '1',
    batchYieldUnit: 'portion',
    laborMinutes: '0',
    laborRateMinor: 0,
    overheadMode: 'none' as const,
    overheadValue: '0',
    items: [
      {
        id: 'sauce-line',
        kind: 'recipe' as const,
        name: 'Sauce',
        quantity,
        unit,
        detail: createSauce(batchCostMinor),
      },
    ],
    packaging: [],
  } satisfies RecipeCostInput;
}

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

  it('uses the whole 1000 ml batch cost for a 1 L sub-recipe line', () => {
    const sauce = calculateRecipeCost(createSauce(5), '0', 2);
    const dish = calculateRecipeCost(createDishUsingSauce('1', 'L'), '0', 2);

    expect(sauce.batchFoodCost.eq(new Decimal('0.05'))).toBe(true);
    expect(sauce.foodCostPerYieldUnit.eq(new Decimal('0.00005'))).toBe(true);
    expect(dish.batchFoodCost.eq(new Decimal('0.05'))).toBe(true);
    expect(dish.breakdown[0]?.costPerPortion.eq(new Decimal('0.05'))).toBe(true);
    expect(dish.breakdown[0]?.subRecipeCalculation?.quantity.eq(1000)).toBe(true);
    expect(dish.breakdown[0]?.subRecipeCalculation?.unit).toBe('ml');
    expect(
      dish.breakdown[0]?.subRecipeCalculation?.costPerBaseUnit.eq(
        new Decimal('0.00005'),
      ),
    ).toBe(true);
    expect(
      dish.breakdown[0]?.subRecipeCalculation?.lineCost.eq(
        new Decimal('0.05'),
      ),
    ).toBe(true);
  });

  it.each([
    { quantity: '1', unit: 'L' as const, expected: '0.05' },
    { quantity: '1000', unit: 'ml' as const, expected: '0.05' },
    { quantity: '250', unit: 'ml' as const, expected: '0.0125' },
    { quantity: '2', unit: 'tbsp' as const, expected: '0.0015' },
  ])('converts $quantity $unit of a sub-recipe to $expected', ({ quantity, unit, expected }) => {
    const result = calculateRecipeCost(createDishUsingSauce(quantity, unit), '0', 2);

    expect(result.breakdown[0]?.costPerPortion.eq(new Decimal(expected))).toBe(true);
  });

  it('scales a realistic 120.00 batch cost across 1000 ml', () => {
    const sauce = calculateRecipeCost(createSauce(12000), '0', 2);
    const dish = calculateRecipeCost(createDishUsingSauce('1', 'L', 12000), '0', 2);

    expect(sauce.foodCostPerYieldUnit.eq(new Decimal('0.12'))).toBe(true);
    expect(dish.breakdown[0]?.costPerPortion.eq(new Decimal('120'))).toBe(true);
  });

  it('treats a 0.05 per-ml rate as a 50.00 cost for 1 L', () => {
    const sauce = calculateRecipeCost(createSauce(5000), '0', 2);
    const dish = calculateRecipeCost(createDishUsingSauce('1', 'L', 5000), '0', 2);

    expect(sauce.foodCostPerYieldUnit.eq(new Decimal('0.05'))).toBe(true);
    expect(dish.breakdown[0]?.costPerPortion.eq(new Decimal('50'))).toBe(true);
  });

  it('applies the waste buffer once to ingredients inside a sub-recipe', () => {
    const result = calculateRecipeCost(createDishUsingSauce('0.01', 'L'), '5', 2);

    expect(
      result.breakdown[0]?.subRecipeCalculation?.costPerBaseUnit.eq(
        new Decimal('0.0000525'),
      ),
    ).toBe(true);
    expect(result.breakdown[0]?.costPerPortion.eq(new Decimal('0.000525'))).toBe(true);
    expect(result.foodCostPerPortion.eq(new Decimal('0.000525'))).toBe(true);
  });
});
