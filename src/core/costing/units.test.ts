import { Decimal } from 'decimal.js';
import { describe, expect, it } from 'vitest';

import {
  ConversionMissingError,
  FamilyMismatchError,
  InvalidQuantityError,
  convert,
  getFriendlyUnitRate,
  isFamilyMismatchError,
  isUnitMismatchError,
  type IngredientUnitConversion,
} from './units';

describe('unit conversions', () => {
  it('converts metric weight and volume exactly', () => {
    expect(convert('1', 'L', 'ml').toString()).toBe('1000');
    expect(convert('1', 'kg', 'g').toString()).toBe('1000');
    expect(convert('1000', 'ml', 'L').toString()).toBe('1');
  });

  it('uses the configured tablespoon size', () => {
    expect(
      convert('1', 'tbsp', 'ml', undefined, {
        cupMl: '250',
        tablespoonMl: '20',
      }).toString(),
    ).toBe('20');
  });

  it('requires an ingredient conversion when units cross families', () => {
    expect(() => convert('1', 'cup', 'g')).toThrow(ConversionMissingError);
    expect(() => convert('1', 'g', 'ml')).toThrow(FamilyMismatchError);

    const flourConversion: IngredientUnitConversion = {
      fromUnit: 'cup',
      baseQuantity: '120',
      baseUnit: 'g',
    };
    expect(convert('1', 'cup', 'g', [flourConversion]).toString()).toBe('120');
    expect(convert('240', 'g', 'cup', [flourConversion]).toString()).toBe('2');
  });

  it('recognizes unit mismatch errors even when the class instance comes from another bundle copy', () => {
    const duplicateBundleError = Object.assign(
      new Error('Cannot convert L to g.'),
      { name: 'FamilyMismatchError', fromUnit: 'L', toUnit: 'g' },
    );

    expect(isUnitMismatchError(duplicateBundleError)).toBe(true);
    expect(isFamilyMismatchError(duplicateBundleError)).toBe(true);
  });

  it('requires a saved conversion for pack units', () => {
    expect(() => convert('1', 'pack', 'piece')).toThrow(ConversionMissingError);

    const packConversion: IngredientUnitConversion = {
      fromUnit: 'pack',
      baseQuantity: '24',
      baseUnit: 'pc',
    };
    expect(convert('2', 'pack', 'piece', [packConversion]).toString()).toBe('48');
    expect(convert('48', 'piece', 'pack', [packConversion]).toString()).toBe('2');
  });

  it.each(['0', '-1', 'NaN'])('rejects invalid quantities (%s)', (quantity) => {
    expect(() => convert(quantity, 'kg', 'g')).toThrow(InvalidQuantityError);
  });

  it('scales a base-unit price to a friendly unit without rounding the calculation', () => {
    const rate = getFriendlyUnitRate(new Decimal('0.05'), 'ml', 'metric');
    expect(rate.unit).toBe('L');
    expect(rate.cost.toString()).toBe('50');
  });
});
