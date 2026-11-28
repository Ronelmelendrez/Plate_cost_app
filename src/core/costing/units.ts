import { Decimal } from 'decimal.js';

export const PURCHASE_UNITS = [
  'mg',
  'kg',
  'g',
  'lb',
  'oz',
  'L',
  'ml',
  'fl oz',
  'piece',
  'dozen',
  'pack',
] as const;
export type PurchaseUnit = (typeof PURCHASE_UNITS)[number];
export const BASE_UNITS = ['g', 'ml', 'pc'] as const;
export type BaseUnit = (typeof BASE_UNITS)[number];
export const CONVERSION_UNITS = ['cup', 'tbsp', 'tsp', 'piece', 'dozen', 'pack'] as const;
export type ConversionUnit = (typeof CONVERSION_UNITS)[number];
export const RECIPE_YIELD_UNITS = [...BASE_UNITS, 'portion'] as const;
export const RECIPE_UNITS = [
  'mg',
  'kg',
  'g',
  'lb',
  'oz',
  'L',
  'ml',
  'fl oz',
  'piece',
  'pc',
  'dozen',
  'pack',
  'cup',
  'tbsp',
  'tsp',
  'portion',
] as const;
export type RecipeUnit = (typeof RECIPE_UNITS)[number];
export type RecipeYieldUnit = BaseUnit | 'portion';
export type MeasurementUnit = PurchaseUnit | RecipeUnit;
export type UnitFamily = 'weight' | 'volume' | 'count';
export type UnitSystem = 'metric' | 'us';

export interface RecipeUnitSizes {
  cupMl: string;
  tablespoonMl: string;
}

export interface IngredientUnitConversion {
  fromUnit: ConversionUnit;
  baseQuantity: string;
  baseUnit: BaseUnit;
}

export const DEFAULT_RECIPE_UNIT_SIZES: RecipeUnitSizes = {
  cupMl: '240',
  tablespoonMl: '15',
};

export const UNIT_BASE: Record<PurchaseUnit, BaseUnit> = {
  mg: 'g',
  kg: 'g',
  g: 'g',
  lb: 'g',
  oz: 'g',
  L: 'ml',
  ml: 'ml',
  'fl oz': 'ml',
  piece: 'pc',
  dozen: 'pc',
  pack: 'pc',
};

const UNIT_FAMILIES: Record<MeasurementUnit, UnitFamily> = {
  mg: 'weight',
  g: 'weight',
  kg: 'weight',
  oz: 'weight',
  lb: 'weight',
  ml: 'volume',
  L: 'volume',
  tsp: 'volume',
  tbsp: 'volume',
  cup: 'volume',
  'fl oz': 'volume',
  pc: 'count',
  piece: 'count',
  dozen: 'count',
  pack: 'count',
  portion: 'count',
};

const UNIT_FACTORS: Partial<Record<MeasurementUnit, Decimal>> = {
  mg: new Decimal('0.001'),
  g: new Decimal(1),
  kg: new Decimal(1000),
  oz: new Decimal('28.349523125'),
  lb: new Decimal('453.59237'),
  ml: new Decimal(1),
  L: new Decimal(1000),
  'fl oz': new Decimal('29.5735295625'),
  pc: new Decimal(1),
  piece: new Decimal(1),
  dozen: new Decimal(12),
  portion: new Decimal(1),
};

const BASE_UNIT_BY_UNIT: Record<MeasurementUnit, BaseUnit> = {
  mg: 'g',
  g: 'g',
  kg: 'g',
  oz: 'g',
  lb: 'g',
  ml: 'ml',
  L: 'ml',
  tsp: 'ml',
  tbsp: 'ml',
  cup: 'ml',
  'fl oz': 'ml',
  pc: 'pc',
  piece: 'pc',
  dozen: 'pc',
  pack: 'pc',
  portion: 'pc',
};

export class UnitMismatchError extends Error {
  constructor(message = 'These units cannot be converted without an ingredient-specific conversion.') {
    super(message);
    this.name = 'UnitMismatchError';
  }
}

export class FamilyMismatchError extends UnitMismatchError {
  constructor(
    readonly fromUnit: MeasurementUnit,
    readonly toUnit: MeasurementUnit,
  ) {
    super(`Cannot convert ${fromUnit} to ${toUnit}; their measurement families differ.`);
    this.name = 'FamilyMismatchError';
  }
}

export class ConversionMissingError extends UnitMismatchError {
  constructor(readonly unit: MeasurementUnit) {
    super(`An ingredient-specific conversion is required for ${unit}.`);
    this.name = 'ConversionMissingError';
  }
}

export class InvalidQuantityError extends Error {
  constructor() {
    super('Quantity must be a finite number greater than zero.');
    this.name = 'InvalidQuantityError';
  }
}

function hasErrorName(error: unknown, name: string): error is { name: string } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    error.name === name
  );
}

export function isUnitMismatchError(error: unknown): error is UnitMismatchError {
  return (
    error instanceof UnitMismatchError ||
    hasErrorName(error, 'UnitMismatchError') ||
    hasErrorName(error, 'FamilyMismatchError') ||
    hasErrorName(error, 'ConversionMissingError')
  );
}

export function isFamilyMismatchError(error: unknown): error is FamilyMismatchError {
  return (
    error instanceof FamilyMismatchError ||
    (hasErrorName(error, 'FamilyMismatchError') &&
      'fromUnit' in error &&
      typeof error.fromUnit === 'string' &&
      'toUnit' in error &&
      typeof error.toUnit === 'string')
  );
}

export function isConversionMissingError(error: unknown): error is ConversionMissingError {
  return (
    error instanceof ConversionMissingError ||
    (hasErrorName(error, 'ConversionMissingError') &&
      'unit' in error &&
      typeof error.unit === 'string')
  );
}

function positiveDecimal(value: string) {
  let decimal: Decimal;
  try {
    decimal = new Decimal(value);
  } catch {
    throw new InvalidQuantityError();
  }
  if (!decimal.isFinite() || decimal.lte(0)) {
    throw new InvalidQuantityError();
  }
  return decimal;
}

function conversionFor(
  unit: MeasurementUnit,
  conversions: IngredientUnitConversion[] = [],
) {
  return conversions.find((conversion) => conversion.fromUnit === unit);
}

function factorFor(unit: MeasurementUnit, unitSizes: RecipeUnitSizes) {
  if (unit === 'cup') {
    return positiveDecimal(unitSizes.cupMl);
  }
  if (unit === 'tbsp') {
    return positiveDecimal(unitSizes.tablespoonMl);
  }
  if (unit === 'tsp') {
    return positiveDecimal(unitSizes.tablespoonMl).div(3);
  }
  return UNIT_FACTORS[unit];
}

export function getUnitFamily(unit: MeasurementUnit): UnitFamily {
  return UNIT_FAMILIES[unit];
}

export function unitBase(unit: RecipeUnit): BaseUnit {
  return BASE_UNIT_BY_UNIT[unit];
}

export function purchaseBaseUnit(
  unit: PurchaseUnit,
  conversion?: Pick<IngredientUnitConversion, 'baseQuantity' | 'baseUnit'>,
) {
  if (conversion) {
    positiveDecimal(conversion.baseQuantity);
    return conversion.baseUnit;
  }
  if (!factorFor(unit, DEFAULT_RECIPE_UNIT_SIZES)) {
    throw new ConversionMissingError(unit);
  }
  return BASE_UNIT_BY_UNIT[unit];
}

export function quantityInBaseUnits(
  quantity: string,
  unit: RecipeUnit,
  conversion?: Pick<IngredientUnitConversion, 'baseQuantity' | 'baseUnit'>,
  unitSizes: RecipeUnitSizes = DEFAULT_RECIPE_UNIT_SIZES,
) {
  const amount = positiveDecimal(quantity);
  if (conversion) {
    const baseQuantity = positiveDecimal(conversion.baseQuantity);
    return {
      quantity: amount.mul(baseQuantity),
      unit: conversion.baseUnit,
    };
  }
  const factor = factorFor(unit, unitSizes);
  if (!factor) {
    throw new ConversionMissingError(unit);
  }
  return { quantity: amount.mul(factor), unit: BASE_UNIT_BY_UNIT[unit] };
}

export function convert(
  quantity: string,
  fromUnit: MeasurementUnit,
  toUnit: MeasurementUnit,
  conversions: IngredientUnitConversion[] = [],
  unitSizes: RecipeUnitSizes = DEFAULT_RECIPE_UNIT_SIZES,
) {
  const amount = positiveDecimal(quantity);
  const sourceConversion = conversionFor(fromUnit, conversions);
  const sourceFactor = sourceConversion
    ? positiveDecimal(sourceConversion.baseQuantity)
    : factorFor(fromUnit, unitSizes);
  if (!sourceFactor) {
    throw new ConversionMissingError(fromUnit);
  }
  const sourceBaseUnit = sourceConversion?.baseUnit ?? BASE_UNIT_BY_UNIT[fromUnit];
  const baseQuantity = amount.mul(sourceFactor);

  if (toUnit === sourceBaseUnit) {
    return baseQuantity;
  }

  const targetConversion = conversionFor(toUnit, conversions);
  if (targetConversion) {
    if (targetConversion.baseUnit !== sourceBaseUnit) {
      throw new FamilyMismatchError(fromUnit, toUnit);
    }
    return baseQuantity.div(positiveDecimal(targetConversion.baseQuantity));
  }

  const targetFactor = factorFor(toUnit, unitSizes);
  if (!targetFactor) {
    throw new ConversionMissingError(toUnit);
  }
  if (BASE_UNIT_BY_UNIT[toUnit] !== sourceBaseUnit) {
    const customConversionCanBridge =
      CONVERSION_UNITS.includes(fromUnit as ConversionUnit) ||
      CONVERSION_UNITS.includes(toUnit as ConversionUnit);
    if (customConversionCanBridge) {
      throw new ConversionMissingError(
        (CONVERSION_UNITS.includes(fromUnit as ConversionUnit)
          ? fromUnit
          : toUnit) as MeasurementUnit,
      );
    }
    throw new FamilyMismatchError(fromUnit, toUnit);
  }
  return baseQuantity.div(targetFactor);
}

export function getFriendlyUnitRate(
  costPerBaseUnit: Decimal,
  baseUnit: BaseUnit,
  unitSystem: UnitSystem,
) {
  if (baseUnit === 'g') {
    const factor = unitSystem === 'metric' ? new Decimal(1000) : UNIT_FACTORS.lb!;
    return {
      unit: unitSystem === 'metric' ? ('kg' as const) : ('lb' as const),
      cost: costPerBaseUnit.mul(factor),
    };
  }
  if (baseUnit === 'ml') {
    const factor =
      unitSystem === 'metric' ? new Decimal(1000) : UNIT_FACTORS['fl oz']!;
    return {
      unit: unitSystem === 'metric' ? ('L' as const) : ('fl oz' as const),
      cost: costPerBaseUnit.mul(factor),
    };
  }
  return { unit: 'piece' as const, cost: costPerBaseUnit };
}

export function costPerUsableBaseUnit(input: {
  priceMinor: number;
  fractionDigits: number;
  purchaseQuantity: string;
  purchaseUnit: PurchaseUnit;
  usableYieldPct: string;
  conversion?: Pick<IngredientUnitConversion, 'baseQuantity' | 'baseUnit'>;
  unitSizes?: RecipeUnitSizes;
}) {
  const quantity = quantityInBaseUnits(
    input.purchaseQuantity,
    input.purchaseUnit,
    input.conversion,
    input.unitSizes,
  ).quantity;
  const usableYield = positiveDecimal(input.usableYieldPct).div(100);
  if (usableYield.lt(0.01) || usableYield.gt(1)) {
    throw new Error('Usable yield must be a percentage from 1 to 100.');
  }

  const price = new Decimal(input.priceMinor).div(new Decimal(10).pow(input.fractionDigits));
  return price.div(quantity.mul(usableYield));
}
