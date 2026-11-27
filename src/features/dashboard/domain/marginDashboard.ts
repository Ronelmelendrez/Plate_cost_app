import { Decimal } from 'decimal.js';

import { calculateRecipeCost } from '@core/costing/costEngine';
import { calculateChannelPricing } from '@core/costing/channelPricing';
import type { getRecipeWorkspace } from '@features/recipes';

export type MarginStatus = 'good' | 'close' | 'low';

export interface MarginDashboardRow {
  recipeId: string;
  name: string;
  price?: Decimal;
  cost: Decimal;
  profit?: Decimal;
  marginPct?: Decimal;
}

export function getMarginStatus(marginPct: Decimal, targetMarginPct: Decimal): MarginStatus {
  if (marginPct.gte(targetMarginPct)) {
    return 'good';
  }
  if (marginPct.gte(targetMarginPct.minus(5))) {
    return 'close';
  }
  return 'low';
}

export function buildMarginDashboardRows(
  workspace: Awaited<ReturnType<typeof getRecipeWorkspace>>,
  channelId: string,
  fractionDigits: number,
) {
  const channel = workspace.channels.find((item) => item.id === channelId);
  if (!channel) {
    throw new Error('The selected sales channel could not be loaded.');
  }

  const recipeInputs = new Map(workspace.recipeCostInputs.map((recipe) => [recipe.id, recipe]));
  const pricesByRecipe = new Map(
    workspace.channelPrices
      .filter((price) => price.channelId === channelId)
      .map((price) => [price.recipeId, price.priceMinor]),
  );

  return workspace.recipes.flatMap((recipe) => {
    if (recipe.isSubRecipe) {
      return [];
    }
    const recipeInput = recipeInputs.get(recipe.id);
    const priceMinor = pricesByRecipe.get(recipe.id);
    if (!recipeInput) {
      throw new Error(`Dish "${recipe.name}" could not be loaded for margin calculation.`);
    }

    const recipeCost = calculateRecipeCost(
      recipeInput,
      workspace.wastePct,
      fractionDigits,
      workspace.unitSizes,
    );
    const cost = recipeCost.foodCostPerPortion.plus(
      recipeCost.packagingCostByChannel[channelId] ?? new Decimal(0),
    );
    if (priceMinor === undefined) {
      return [{ recipeId: recipe.id, name: recipe.name, cost }];
    }

    const pricing = calculateChannelPricing({
      costPerPortion: cost,
      priceMinor,
      fractionDigits,
      commissionPct: channel.commissionPct,
      paymentFeePct: channel.paymentFeePct,
      pricesIncludeTax: workspace.settings.pricesIncludeTax,
      taxPct: workspace.settings.taxPct,
      feesOnTaxIncludedPrice: workspace.settings.feesOnTaxIncludedPrice,
    });

    return [
      {
        recipeId: recipe.id,
        name: recipe.name,
        price: pricing.grossPrice,
        cost,
        profit: pricing.profit,
        marginPct: pricing.marginPct,
      },
    ];
  });
}

export function sortMarginDashboardRows(rows: MarginDashboardRow[]) {
  return [...rows].sort((first, second) => {
    if (!first.marginPct) {
      return second.marginPct ? 1 : first.name.localeCompare(second.name);
    }
    if (!second.marginPct) {
      return -1;
    }
    return first.marginPct.comparedTo(second.marginPct);
  });
}
