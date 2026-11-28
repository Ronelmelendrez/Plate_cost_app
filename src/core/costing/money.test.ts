import { Decimal } from 'decimal.js';
import { describe, expect, it } from 'vitest';

import {
  currencyFractionDigits,
  formatDecimalInput,
  formatCurrency,
  formatUnitCost,
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

  it('preserves useful precision for non-zero amounts smaller than one currency unit', () => {
    expect(formatCurrency(new Decimal('0.00005'), 'USD', 'en-US')).toBe('$0.00005');
    expect(formatCurrency(new Decimal('0.0015'), 'USD', 'en-US')).toBe('$0.0015');
    expect(formatCurrency(new Decimal('0.000525'), 'USD', 'en-US')).toBe('$0.000525');
    expect(formatCurrency(new Decimal('0.5'), 'JPY', 'en-US')).toBe('¥0.5');
    expect(formatCurrency(new Decimal('12.345'), 'USD', 'en-US')).toBe('$12.35');
  });

  it('shows precise unit costs without adding noise to currency amounts', () => {
    expect(formatUnitCost(new Decimal('0.30423423'), 'USD', 'en-US')).toBe(
      '$0.30423423',
    );
    expect(formatUnitCost(new Decimal('0.30423423'), 'JPY', 'en-US')).toBe(
      '¥0.30423423',
    );
    expect(formatUnitCost(new Decimal('1.2'), 'USD', 'en-US')).toBe('$1.20');
    expect(formatUnitCost(new Decimal('0.000000004'), 'USD', 'en-US')).toBe(
      '$0.000000004',
    );
    expect(formatCurrency(new Decimal('0.30423423'), 'USD', 'en-US')).toBe('$0.30');
  });
});
