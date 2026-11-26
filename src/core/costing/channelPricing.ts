import { Decimal } from 'decimal.js';

export interface ChannelPricingInput {
  costPerPortion: Decimal;
  priceMinor: number;
  fractionDigits: number;
  commissionPct: string;
  paymentFeePct: string;
  pricesIncludeTax: boolean;
  taxPct: string;
  feesOnTaxIncludedPrice: boolean;
}

export interface ChannelPricingResult {
  grossPrice: Decimal;
  netPrice: Decimal;
  fees: Decimal;
  profit: Decimal;
  marginPct: Decimal;
}

export function calculateChannelPricing(input: ChannelPricingInput): ChannelPricingResult {
  if (
    !Number.isSafeInteger(input.priceMinor) ||
    input.priceMinor <= 0 ||
    !Number.isInteger(input.fractionDigits) ||
    input.fractionDigits < 0 ||
    input.fractionDigits > 3
  ) {
    throw new Error('A channel price must use valid minor units.');
  }

  const grossPrice = new Decimal(input.priceMinor).div(
    new Decimal(10).pow(input.fractionDigits),
  );
  const taxPct = new Decimal(input.taxPct);
  const commissionPct = new Decimal(input.commissionPct);
  const paymentFeePct = new Decimal(input.paymentFeePct);
  if (
    taxPct.lt(0) ||
    taxPct.gt(100) ||
    commissionPct.lt(0) ||
    commissionPct.gt(100) ||
    paymentFeePct.lt(0) ||
    paymentFeePct.gt(100) ||
    input.costPerPortion.lt(0)
  ) {
    throw new Error('Channel fees, tax, and recipe cost must be valid non-negative amounts.');
  }
  const feePct = commissionPct.plus(paymentFeePct);
  const netPrice = input.pricesIncludeTax
    ? grossPrice.div(new Decimal(1).plus(taxPct.div(100)))
    : grossPrice;
  const feeBase = input.feesOnTaxIncludedPrice ? grossPrice : netPrice;
  const fees = feeBase.mul(feePct).div(100);
  const profit = netPrice.minus(fees).minus(input.costPerPortion);

  return {
    grossPrice,
    netPrice,
    fees,
    profit,
    marginPct: profit.div(netPrice).mul(100),
  };
}
