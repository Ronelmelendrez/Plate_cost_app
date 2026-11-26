import { Decimal } from 'decimal.js';

export const MAX_CURRENCY_FRACTION_DIGITS = 4;

export function currencyFractionDigits(currency: string, locale: string) {
  return (
    new Intl.NumberFormat(locale, { style: 'currency', currency }).resolvedOptions()
      .maximumFractionDigits ?? 2
  );
}

export function parseDecimal(value: string, locale: string) {
  const trimmed = value.trim().replace(/[\s\u00a0\u202f]/g, '');
  if (!trimmed) {
    return null;
  }

  const commaIndex = trimmed.lastIndexOf(',');
  const dotIndex = trimmed.lastIndexOf('.');
  let normalized = trimmed;

  if (commaIndex >= 0 && dotIndex >= 0) {
    const decimalSeparator = commaIndex > dotIndex ? ',' : '.';
    const groupingSeparator = decimalSeparator === ',' ? '.' : ',';
    normalized = trimmed.split(groupingSeparator).join('');
    if (decimalSeparator === ',') {
      normalized = normalized.replace(',', '.');
    }
  } else if (commaIndex >= 0 || dotIndex >= 0) {
    const separator = commaIndex >= 0 ? ',' : '.';
    const groups = trimmed.split(separator);
    if (groups.length > 2) {
      const localeDecimalSeparator = new Intl.NumberFormat(locale)
        .formatToParts(1.1)
        .find((part) => part.type === 'decimal')?.value;
      const integerPart = groups[0].replace(/^-/, '');
      const isGrouping =
        separator !== localeDecimalSeparator &&
        /^\d{1,3}$/.test(integerPart) &&
        groups.slice(1).every((group) => /^\d{3}$/.test(group));
      if (!isGrouping) {
        return null;
      }
      normalized = groups.join('');
    } else {
      normalized = trimmed.replace(separator, '.');
    }
  }

  if (!/^-?\d+(?:\.\d+)?$/.test(normalized)) {
    return null;
  }

  try {
    return new Decimal(normalized);
  } catch {
    return null;
  }
}

export function formatDecimalInput(value: string, locale: string) {
  const parsed = parseDecimal(value, locale);
  if (!parsed) {
    return value;
  }

  const [integerPart, fractionalPart] = parsed.toFixed().split('.');
  const groupingFormatter = new Intl.NumberFormat(locale, {
    useGrouping: true,
    maximumFractionDigits: 0,
  });
  const groupedInteger = groupingFormatter.format(BigInt(integerPart));
  if (!fractionalPart) {
    return groupedInteger;
  }

  const decimalSeparator = new Intl.NumberFormat(locale)
    .formatToParts(1.1)
    .find((part) => part.type === 'decimal')?.value;
  return `${groupedInteger}${decimalSeparator ?? '.'}${fractionalPart}`;
}

export function toMinorUnits(value: Decimal, fractionDigits: number) {
  if (
    !Number.isInteger(fractionDigits) ||
    fractionDigits < 0 ||
    fractionDigits > MAX_CURRENCY_FRACTION_DIGITS
  ) {
    return null;
  }
  const scaled = value.mul(new Decimal(10).pow(fractionDigits));
  if (!scaled.isInteger()) {
    return null;
  }
  const minorUnits = scaled.toNumber();
  return Number.isSafeInteger(minorUnits) ? minorUnits : null;
}

export function formatCurrency(amount: Decimal, currency: string, locale: string) {
  const fractionDigits = currencyFractionDigits(currency, locale);
  const roundedAmount = amount.toDecimalPlaces(fractionDigits, Decimal.ROUND_HALF_UP);
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(roundedAmount.toNumber());
}

export function currencyAffixes(currency: string, locale: string) {
  const parts = new Intl.NumberFormat(locale, { style: 'currency', currency }).formatToParts(1);
  const currencyIndex = parts.findIndex((part) => part.type === 'currency');
  const integerIndex = parts.findIndex((part) => part.type === 'integer');
  const symbol = parts[currencyIndex]?.value ?? currency;

  if (currencyIndex < integerIndex) {
    const literal = parts[currencyIndex + 1]?.type === 'literal' ? parts[currencyIndex + 1].value : '';
    return { prefix: `${symbol}${literal}`, suffix: '' };
  }

  const literal = parts[currencyIndex - 1]?.type === 'literal' ? parts[currencyIndex - 1].value : '';
  return { prefix: '', suffix: `${literal}${symbol}` };
}
