import { Decimal } from 'decimal.js';

import { calculateRecipeCost } from '@core/costing/costEngine';
import { calculateChannelPricing } from '@core/costing/channelPricing';
import { isUnitMismatchError } from '@core/costing/units';
import type { RecipeCostInput } from '@core/costing/costEngine';

interface MarginDashboardWorkspace {
  recipes: { id: string; name: string; isSubRecipe: boolean }[];
  recipeCostInputs: RecipeCostInput[];
  channels: { id: string; commissionPct: string; paymentFeePct: string }[];
  channelPrices: { recipeId: string; channelId: string; priceMinor: number }[];
  wastePct: string;
  unitSizes: { cupMl: string; tablespoonMl: string };
  settings: {
    pricesIncludeTax: boolean;
    taxPct: string;
    feesOnTaxIncludedPrice: boolean;
  };
}

export type MarginStatus = 'good' | 'close' | 'low';

export interface MarginDashboardRow {
  recipeId: string;
  name: string;
  price?: Decimal;
  cost: Decimal;
  profit?: Decimal;
  marginPct?: Decimal;
}

export interface InvalidMarginRecipe {
  recipeId: string;
  name: string;
}

export interface MarginDashboardResult {
  rows: MarginDashboardRow[];
  invalidRecipes: InvalidMarginRecipe[];
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
  workspace: MarginDashboardWorkspace,
  channelId: string,
  fractionDigits: number,
): MarginDashboardResult {
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

  const rows: MarginDashboardRow[] = [];
  const invalidRecipes: InvalidMarginRecipe[] = [];
  for (const recipe of workspace.recipes) {
    if (recipe.isSubRecipe) {
      continue;
    }
    const recipeInput = recipeInputs.get(recipe.id);
    const priceMinor = pricesByRecipe.get(recipe.id);
    if (!recipeInput) {
      throw new Error(`Dish "${recipe.name}" could not be loaded for margin calculation.`);
    }

    let recipeCost;
    try {
      recipeCost = calculateRecipeCost(
        recipeInput,
        workspace.wastePct,
        fractionDigits,
        workspace.unitSizes,
      );
    } catch (error) {
      if (isUnitMismatchError(error)) {
        invalidRecipes.push({ recipeId: recipe.id, name: recipe.name });
        continue;
      }
      throw error;
    }
    const cost = recipeCost.foodCostPerPortion.plus(
      recipeCost.packagingCostByChannel[channelId] ?? new Decimal(0),
    );
    if (priceMinor === undefined) {
      rows.push({ recipeId: recipe.id, name: recipe.name, cost });
      continue;
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

    rows.push({
      recipeId: recipe.id,
      name: recipe.name,
      price: pricing.grossPrice,
      cost,
      profit: pricing.profit,
      marginPct: pricing.marginPct,
    });
  }
  return { rows, invalidRecipes };
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
