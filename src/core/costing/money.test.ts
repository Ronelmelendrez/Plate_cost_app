import { Decimal } from 'decimal.js';
import { describe, expect, it } from 'vitest';

import {
  currencyFractionDigits,
  formatDecimalInput,
  parseDecimal,
  toMinorUnits,
} from './money';

describe('decimal number entry', () => {
  it('accepts comma and dot as decimal separators in every locale', () => {
    expect(parseDecimal('1.234', 'en-US')?.toString()).toBe('1.234');
    expect(parseDecimal('1,234', 'de-DE')?.toString()).toBe('1.234');
  });

  it('accepts mixed separators and grouped numbers', () => {
    expect(parseDecimal('1,234.50', 'en-US')?.toString()).toBe('1234.5');
    expect(parseDecimal('1.234,50', 'de-DE')?.toString()).toBe('1234.5');
    expect(parseDecimal('1,234,567', 'en-US')?.toString()).toBe('1234567');
    expect(parseDecimal('1,23,4', 'en-US')).toBeNull();
  });

  it('formats valid input with the selected locale after editing', () => {
    expect(formatDecimalInput('1234,5', 'de-DE')).toBe('1.234,5');
    expect(formatDecimalInput('-1234.5', 'en-US')).toBe('-1,234.5');
  });

  it('groups large integers exactly without converting them to Number or BigInt', () => {
    expect(formatDecimalInput('123456789012345678901234.56', 'en-US')).toBe(
      '123,456,789,012,345,678,901,234.56',
    );
    expect(formatDecimalInput('123456789', 'en-IN')).toBe('12,34,56,789');
  });
});

describe('currency precision', () => {
  it('supports zero-, two-, three-, and four-decimal ISO currencies', () => {
    expect(currencyFractionDigits('JPY', 'ja-JP')).toBe(0);
    expect(currencyFractionDigits('USD', 'en-US')).toBe(2);
    expect(currencyFractionDigits('KWD', 'en-US')).toBe(3);
    expect(currencyFractionDigits('CLF', 'es-CL')).toBe(4);
  });

  it('converts only exact values within the currency precision to minor units', () => {
    expect(toMinorUnits(new Decimal('1.2345'), 4)).toBe(12345);
    expect(toMinorUnits(new Decimal('1.23456'), 4)).toBeNull();
    expect(toMinorUnits(new Decimal('1'), 5)).toBeNull();
  });
});
