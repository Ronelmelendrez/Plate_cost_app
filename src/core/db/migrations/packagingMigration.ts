import { Decimal } from 'decimal.js';

import {
  quantityInBaseUnits,
  type RecipeUnit,
  type RecipeUnitSizes,
  type RecipeYieldUnit,
} from '@core/costing/units';

export interface LegacyRecipeRow {
  id: string;
  portions: number;
  batch_yield_quantity: string;
  batch_yield_unit: RecipeYieldUnit;
  is_sub_recipe: number;
}

export interface LegacyRecipeItemRow {
  id: string;
  recipe_id: string;
  kind: string;
  reference_id: string;
  quantity: string;
  unit: RecipeUnit;
}

export interface MigratedPackagingLine {
  id?: string;
  recipeId: string;
  packagingId: string;
  quantity: string;
}

export function expandLegacyPackaging(
  recipes: LegacyRecipeRow[],
  items: LegacyRecipeItemRow[],
  wastePct: string,
  unitSizes: RecipeUnitSizes,
) {
  const recipesById = new Map(recipes.map((recipe) => [recipe.id, recipe]));
  const itemsByRecipeId = new Map<string, LegacyRecipeItemRow[]>();
  for (const item of items) {
    const current = itemsByRecipeId.get(item.recipe_id) ?? [];
    current.push(item);
    itemsByRecipeId.set(item.recipe_id, current);
  }

  const dishLines: MigratedPackagingLine[] = [];
  const wasteFactor = new Decimal(1).plus(new Decimal(wastePct).div(100));

  const expandRecipe = (
    recipe: LegacyRecipeRow,
    dishId: string,
    multiplier: Decimal,
    ancestry: Set<string>,
  ) => {
    if (ancestry.has(recipe.id)) {
      throw new Error('Recipe packaging migration stopped because a recipe cycle was found.');
    }
    const nextAncestry = new Set([...ancestry, recipe.id]);
    for (const item of itemsByRecipeId.get(recipe.id) ?? []) {
      if (item.kind === 'packaging') {
        const line = {
          recipeId: recipe.is_sub_recipe ? dishId : recipe.id,
          packagingId: item.reference_id,
          quantity: new Decimal(item.quantity).mul(multiplier).toString(),
        };
        if (recipe.is_sub_recipe) {
          dishLines.push(line);
        } else {
          dishLines.push({ ...line, id: item.id });
        }
        continue;
      }
      if (item.kind !== 'recipe') {
        continue;
      }
      const child = recipesById.get(item.reference_id);
      if (!child) {
        throw new Error(
          'Recipe packaging migration stopped because a linked sub-recipe is missing.',
        );
      }
      if (!child.is_sub_recipe) {
        throw new Error(
          'Recipe packaging migration stopped because a dish is linked as a sub-recipe.',
        );
      }
      const amount = quantityInBaseUnits(item.quantity, item.unit, undefined, unitSizes);
      const yieldAmount = quantityInBaseUnits(
        child.batch_yield_quantity,
        child.batch_yield_unit,
        undefined,
        unitSizes,
      );
      if (amount.unit !== yieldAmount.unit || yieldAmount.quantity.lte(0)) {
        throw new Error(
          'Recipe packaging migration stopped because a sub-recipe quantity does not match its yield.',
        );
      }
      const parentPortions = recipe.is_sub_recipe ? 1 : recipe.portions;
      const childMultiplier = multiplier
        .mul(amount.quantity)
        .div(yieldAmount.quantity)
        .mul(wasteFactor)
        .div(parentPortions);
      expandRecipe(child, dishId, childMultiplier, nextAncestry);
    }
  };

  for (const recipe of recipes) {
    if (!recipe.is_sub_recipe) {
      expandRecipe(recipe, recipe.id, new Decimal(1), new Set());
    }
  }

  const legacySubRecipeLines = items.flatMap((item) => {
    const recipe = recipesById.get(item.recipe_id);
    return item.kind === 'packaging' && recipe?.is_sub_recipe
      ? [
          {
            id: item.id,
            recipeId: item.recipe_id,
            packagingId: item.reference_id,
            quantity: item.quantity,
          },
        ]
      : [];
  });
  return { dishLines, legacySubRecipeLines };
}
