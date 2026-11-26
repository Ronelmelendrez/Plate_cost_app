import { Decimal } from 'decimal.js';

export const PURCHASE_UNITS = ['kg', 'g', 'lb', 'oz', 'L', 'ml', 'fl oz', 'piece'] as const;
export type PurchaseUnit = (typeof PURCHASE_UNITS)[number];
export const BASE_UNITS = ['g', 'ml', 'pc'] as const;
export type BaseUnit = (typeof BASE_UNITS)[number];
export const CONVERSION_UNITS = ['cup', 'tbsp', 'tsp', 'piece'] as const;
export type ConversionUnit = (typeof CONVERSION_UNITS)[number];

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
