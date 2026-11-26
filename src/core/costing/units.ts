import { Decimal } from 'decimal.js';

export const PURCHASE_UNITS = ['kg', 'g', 'lb', 'oz', 'L', 'ml', 'fl oz', 'piece'] as const;
export type PurchaseUnit = (typeof PURCHASE_UNITS)[number];
export const BASE_UNITS = ['g', 'ml', 'pc'] as const;
export type BaseUnit = (typeof BASE_UNITS)[number];
export const CONVERSION_UNITS = ['cup', 'tbsp', 'tsp', 'piece'] as const;
export type ConversionUnit = (typeof CONVERSION_UNITS)[number];
export const RECIPE_YIELD_UNITS = [...BASE_UNITS, 'portion'] as const;
export const RECIPE_UNITS = [
  'kg',
  'g',
  'lb',
  'oz',
  'L',
  'ml',
  'fl oz',
  'piece',
  'pc',
  'cup',
  'tbsp',
  'tsp',
  'portion',
] as const;
export type RecipeUnit = (typeof RECIPE_UNITS)[number];
export type RecipeYieldUnit = BaseUnit | 'portion';

export const UNIT_BASE: Record<PurchaseUnit, BaseUnit> = {
  kg: 'g',
  g: 'g',
  lb: 'g',
  oz: 'g',
  L: 'ml',
  ml: 'ml',
  'fl oz': 'ml',
  piece: 'pc',
};

const UNIT_FACTORS: Record<PurchaseUnit, Decimal> = {
  kg: new Decimal(1000),
  g: new Decimal(1),
  lb: new Decimal('453.59237'),
  oz: new Decimal('28.349523125'),
  L: new Decimal(1000),
  ml: new Decimal(1),
  'fl oz': new Decimal('29.5735295625'),
  piece: new Decimal(1),
};

export class UnitMismatchError extends Error {
  constructor() {
    super('These units cannot be converted without an ingredient-specific conversion.');
    this.name = 'UnitMismatchError';
  }
}

export function unitBase(unit: RecipeUnit): BaseUnit {
  if (unit === 'portion' || unit === 'pc' || unit === 'piece') {
    return 'pc';
  }
  if (unit === 'cup' || unit === 'tbsp' || unit === 'tsp') {
    throw new UnitMismatchError();
  }
  return UNIT_BASE[unit];
}

export function quantityInBaseUnits(
  quantity: string,
  unit: RecipeUnit,
  conversion?: { baseQuantity: string; baseUnit: BaseUnit },
) {
  const amount = new Decimal(quantity);
  if (conversion) {
    if (unitBase(conversion.baseUnit) !== conversion.baseUnit) {
      throw new UnitMismatchError();
    }
    return {
      quantity: amount.mul(conversion.baseQuantity),
      unit: conversion.baseUnit,
    };
  }
  if (unit === 'cup' || unit === 'tbsp' || unit === 'tsp') {
    throw new UnitMismatchError();
  }
  if (unit === 'portion' || unit === 'pc' || unit === 'piece') {
    return { quantity: amount, unit: 'pc' as const };
  }
  return { quantity: amount.mul(UNIT_FACTORS[unit]), unit: UNIT_BASE[unit] };
}

export function costPerUsableBaseUnit(input: {
  priceMinor: number;
  fractionDigits: number;
  purchaseQuantity: string;
  purchaseUnit: PurchaseUnit;
  usableYieldPct: string;
}) {
  const quantity = new Decimal(input.purchaseQuantity).mul(UNIT_FACTORS[input.purchaseUnit]);
  const usableYield = new Decimal(input.usableYieldPct).div(100);
  if (quantity.lte(0) || usableYield.lte(0) || usableYield.gt(1)) {
    throw new Error('Purchase quantity and usable yield must be positive.');
  }

  const price = new Decimal(input.priceMinor).div(new Decimal(10).pow(input.fractionDigits));
  return price.div(quantity.mul(usableYield));
}
