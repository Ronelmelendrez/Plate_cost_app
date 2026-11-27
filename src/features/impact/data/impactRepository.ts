import { Decimal } from 'decimal.js';

import { calculateChannelPricing } from '@core/costing/channelPricing';
import { calculateRecipeCost, type RecipeCostInput } from '@core/costing/costEngine';
import { currencyFractionDigits } from '@core/costing/money';
import type { AppDatabase } from '@core/db/client';
import { getRecipeWorkspace } from '@features/recipes/data/recipeRepository';
import type { PriceImpactSource } from '../domain/impactSource';

export type { PriceImpactSource } from '../domain/impactSource';

export type PriceImpactStatus = 'good' | 'close' | 'low' | 'unpriced';

export interface PriceImpactDish {
  recipeId: string;
  name: string;
  costPerPortion: Decimal;
  belowTarget: boolean;
  status: PriceImpactStatus;
  marginPct?: Decimal;
  channelName?: string;
}

export interface PriceChangeImpactReport {
  source: PriceImpactSource;
  sourceName: string;
  dishes: PriceImpactDish[];
  belowTargetCount: number;
  targetMarginPct: string;
  currency: string;
  locale: string;
}

function recipeUsesSource(input: RecipeCostInput, source: PriceImpactSource): boolean {
  return (
    (source.type === 'packaging' &&
      input.packaging.some((line) => line.packagingId === source.id)) ||
    input.items.some((item) => {
      if (source.type === 'ingredient' && item.kind === 'ingredient') {
        return item.ingredient?.id === source.id;
      }
      if (item.kind !== 'recipe' || !item.detail) {
        return false;
      }
      return (
        (source.type === 'recipe' && item.detail.id === source.id) ||
        recipeUsesSource(item.detail, source)
      );
    })
  );
}

function getStatus(marginPct: Decimal, targetMarginPct: Decimal): PriceImpactStatus {
  if (marginPct.gte(targetMarginPct)) {
    return 'good';
  }
  return marginPct.gte(targetMarginPct.minus(5)) ? 'close' : 'low';
}

export async function getPriceChangeImpact(
  database: AppDatabase,
  source: PriceImpactSource,
): Promise<PriceChangeImpactReport> {
  const workspace = await getRecipeWorkspace(database);
  const sourceRecord =
    source.type === 'ingredient'
      ? workspace.ingredients.find((ingredient) => ingredient.id === source.id)
      : source.type === 'recipe'
        ? workspace.recipes.find((recipe) => recipe.id === source.id)
        : workspace.packagingItems.find((item) => item.id === source.id);
  if (!sourceRecord) {
    throw new Error('The changed item could not be found.');
  }

  const fractionDigits = currencyFractionDigits(
    workspace.settings.currencyCode,
    workspace.settings.locale,
  );
  const targetMarginPct = new Decimal(workspace.settings.targetMarginPct);
  const recipeInputs = new Map(
    workspace.recipeCostInputs.map((recipe) => [recipe.id, recipe]),
  );
  const dishes = workspace.recipes
    .filter((recipe) => !recipe.isSubRecipe)
    .flatMap((recipe): PriceImpactDish[] => {
      const recipeInput = recipeInputs.get(recipe.id);
      if (!recipeInput || !recipeUsesSource(recipeInput, source)) {
        return [];
      }

      const recipeCost = calculateRecipeCost(
        recipeInput,
        workspace.wastePct,
        fractionDigits,
        workspace.unitSizes,
      );
      const savedPrices = workspace.channelPrices.filter(
        (price) => price.recipeId === recipe.id,
      );
      const priceRows =
        savedPrices.length > 0
          ? savedPrices
          : recipe.sellingPriceMinor === null
            ? []
            : [{ channelId: 'dine-in', priceMinor: recipe.sellingPriceMinor }];
      const channelMargins = priceRows.flatMap((price) => {
        const channel = workspace.channels.find((item) => item.id === price.channelId);
        if (!channel) {
          return [];
        }
        const costPerPortion = recipeCost.foodCostPerPortion.plus(
          recipeCost.packagingCostByChannel[price.channelId] ?? new Decimal(0),
        );
        const pricing = calculateChannelPricing({
          costPerPortion,
          priceMinor: price.priceMinor,
          fractionDigits,
          commissionPct: channel.commissionPct,
          paymentFeePct: channel.paymentFeePct,
          pricesIncludeTax: workspace.settings.pricesIncludeTax,
          taxPct: workspace.settings.taxPct,
          feesOnTaxIncludedPrice: workspace.settings.feesOnTaxIncludedPrice,
        });
        return [{ channelName: channel.name, marginPct: pricing.marginPct, costPerPortion }];
      });
      const worstChannel = channelMargins.reduce<
        (typeof channelMargins)[number] | undefined
      >(
        (worst, current) =>
          !worst || current.marginPct.lt(worst.marginPct) ? current : worst,
        undefined,
      );
      const belowTarget = channelMargins.some((channel) =>
        channel.marginPct.lt(targetMarginPct),
      );
      const defaultChannelId =
        workspace.channels.find((channel) => channel.id === 'dine-in')?.id ??
        workspace.channels[0]?.id;
      const defaultCost = recipeCost.foodCostPerPortion.plus(
        (defaultChannelId && recipeCost.packagingCostByChannel[defaultChannelId]) ??
          new Decimal(0),
      );

      return [
        {
          recipeId: recipe.id,
          name: recipe.name,
          costPerPortion: worstChannel?.costPerPortion ?? defaultCost,
          belowTarget,
          status: worstChannel
            ? getStatus(worstChannel.marginPct, targetMarginPct)
            : 'unpriced',
          marginPct: worstChannel?.marginPct,
          channelName: worstChannel?.channelName,
        },
      ];
    })
    .sort((first, second) => {
      if (first.belowTarget !== second.belowTarget) {
        return first.belowTarget ? -1 : 1;
      }
      if (first.marginPct && second.marginPct) {
        const marginOrder = first.marginPct.comparedTo(second.marginPct);
        if (marginOrder !== 0) {
          return marginOrder;
        }
      }
      return first.name.localeCompare(second.name);
    });

  return {
    source,
    sourceName: sourceRecord.name,
    dishes,
    belowTargetCount: dishes.filter((dish) => dish.belowTarget).length,
    targetMarginPct: workspace.settings.targetMarginPct,
    currency: workspace.settings.currencyCode,
    locale: workspace.settings.locale,
  };
}
