import { Decimal } from 'decimal.js';

import { currencyFractionDigits, toMinorUnits } from './money';

export const PRICE_ROUNDING_RULES = [
  'ending-zero',
  'ending-half',
  'ending-nines',
  'nearest-10',
  'nearest-50',
  'nearest-100',
  'nearest-1000',
] as const;

export type SuggestedPriceRoundingRule = (typeof PRICE_ROUNDING_RULES)[number];
export type StoredPriceRoundingRule = SuggestedPriceRoundingRule | 'auto';

export interface SuggestedPriceInput {
  costPerPortion: Decimal;
  targetMarginPct: string;
  commissionPct: string;
  paymentFeePct: string;
  taxPct: string;
  fractionDigits: number;
  pricesIncludeTax: boolean;
  feesOnTaxIncludedPrice: boolean;
  roundingRule: SuggestedPriceRoundingRule;
}

export type SuggestedPriceResult =
  | { kind: 'suggested'; price: Decimal; priceMinor: number }
  | { kind: 'impossible' }
  | { kind: 'unrepresentable' };

export function getAvailableRoundingRules(fractionDigits: number): SuggestedPriceRoundingRule[] {
  return fractionDigits === 0
    ? ['nearest-10', 'nearest-50', 'nearest-100', 'nearest-1000']
    : ['ending-zero', 'ending-half', 'ending-nines'];
}

export function getDefaultRoundingRule(
  currency: string,
  locale: string,
): SuggestedPriceRoundingRule {
  return currencyFractionDigits(currency, locale) === 0 ? 'nearest-10' : 'ending-nines';
}

export function roundPriceUp(
  price: Decimal,
  fractionDigits: number,
  roundingRule: SuggestedPriceRoundingRule,
) {
  if (
    price.isNegative() ||
    !Number.isInteger(fractionDigits) ||
    fractionDigits < 0 ||
    fractionDigits > 3 ||
    !getAvailableRoundingRules(fractionDigits).includes(roundingRule)
  ) {
    throw new Error('The suggested price rounding rule is not valid for this currency.');
  }

  const scale = new Decimal(10).pow(fractionDigits);
  const requiredMinorUnits = price.mul(scale).ceil();
  if (roundingRule.startsWith('nearest-')) {
    const increment = new Decimal(roundingRule.slice('nearest-'.length));
    return requiredMinorUnits.div(increment).ceil().mul(increment);
  }

  const fractionalEnding =
    roundingRule === 'ending-zero'
      ? new Decimal(0)
      : roundingRule === 'ending-half'
        ? scale.div(2)
        : scale.minus(1);
  const wholeUnits = requiredMinorUnits.divToInt(scale);
  let roundedMinorUnits = wholeUnits.mul(scale).plus(fractionalEnding);
  if (roundedMinorUnits.lt(requiredMinorUnits)) {
    roundedMinorUnits = roundedMinorUnits.plus(scale);
  }
  return roundedMinorUnits.div(scale);
}

export function calculateSuggestedPrice(input: SuggestedPriceInput): SuggestedPriceResult {
  const targetMarginPct = new Decimal(input.targetMarginPct);
  const commissionPct = new Decimal(input.commissionPct);
  const paymentFeePct = new Decimal(input.paymentFeePct);
  const taxPct = new Decimal(input.taxPct);
  if (
    input.costPerPortion.isNegative() ||
    targetMarginPct.isNegative() ||
    targetMarginPct.gt(100) ||
    commissionPct.isNegative() ||
    commissionPct.gt(100) ||
    paymentFeePct.isNegative() ||
    paymentFeePct.gt(100) ||
    taxPct.isNegative() ||
    taxPct.gt(100)
  ) {
    throw new Error('Suggested price inputs must be valid non-negative amounts and percentages.');
  }

  const fractionDigits = input.fractionDigits;
  if (
    !Number.isInteger(fractionDigits) ||
    fractionDigits < 0 ||
    fractionDigits > 3 ||
    !getAvailableRoundingRules(fractionDigits).includes(input.roundingRule)
  ) {
    throw new Error('The suggested price rounding rule is not valid for this currency.');
  }

  const taxFactor = input.pricesIncludeTax
    ? new Decimal(1).plus(taxPct.div(100))
    : new Decimal(1);
  const feeRate = commissionPct.plus(paymentFeePct).div(100);
  const feesAsShareOfNet =
    input.pricesIncludeTax && input.feesOnTaxIncludedPrice
      ? feeRate.mul(taxFactor)
      : feeRate;
  const denominator = new Decimal(1)
    .minus(targetMarginPct.div(100))
    .minus(feesAsShareOfNet);
  const minorUnit = new Decimal(1).div(new Decimal(10).pow(fractionDigits));

  if (denominator.isNegative() || (denominator.isZero() && input.costPerPortion.gt(0))) {
    return { kind: 'impossible' };
  }

  const shelfPrice =
    denominator.isZero() || input.costPerPortion.isZero()
      ? minorUnit
      : input.costPerPortion.div(denominator).mul(taxFactor);
  const price = roundPriceUp(shelfPrice, fractionDigits, input.roundingRule);
  const priceMinor = toMinorUnits(price, fractionDigits);
  if (priceMinor === null || priceMinor <= 0) {
    return { kind: 'unrepresentable' };
  }
  return { kind: 'suggested', price, priceMinor };
}
