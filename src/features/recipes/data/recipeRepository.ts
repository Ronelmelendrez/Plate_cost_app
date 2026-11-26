import { asc, eq, inArray } from 'drizzle-orm';

import {
  calculateRecipeCost,
  InvalidSubRecipeError,
  MissingRecipeReferenceError,
  RecipeCycleError,
  type RecipeCostInput,
  type RecipeCostLine,
} from '@core/costing/costEngine';
import { detectCycle, type RecipeEdge } from '@core/costing/cycleCheck';
import type { AppDatabase } from '@core/db/client';
import {
  globalSettings,
  ingredients,
  packagingItems,
  recipeItems,
  recipes,
  unitConversions,
} from '@core/db/schema';
import type { RecipeUnit, RecipeYieldUnit } from '@core/costing/units';

export type Recipe = typeof recipes.$inferSelect;
export type PackagingItem = typeof packagingItems.$inferSelect;

export interface RecipeItemDraft {
  id: string;
  kind: 'ingredient' | 'recipe' | 'packaging';
  referenceId: string;
  quantity: string;
  unit: RecipeUnit;
}

export interface RecipeInput {
  id?: string;
  name: string;
  portions: number;
  batchYieldQuantity: string;
  batchYieldUnit: RecipeYieldUnit;
  isSubRecipe: boolean;
  sellingPriceMinor: number | null;
  notes: string;
  laborMinutes: string;
  laborRateMinor: number;
  overheadMode: 'none' | 'flat' | 'percent';
  overheadValue: string;
  items: RecipeItemDraft[];
}

export interface RecipeSummary {
  recipe: Recipe;
  costPerUnit: string;
  batchCost: string;
  itemCount: number;
}

async function loadCostingContext(database: AppDatabase) {
  const [recipeRows, itemRows, ingredientRows, conversionRows, packagingRows, settingsRows] =
    await Promise.all([
      database.select().from(recipes).orderBy(asc(recipes.name)),
      database.select().from(recipeItems),
      database.select().from(ingredients).orderBy(asc(ingredients.name)),
      database.select().from(unitConversions),
      database.select().from(packagingItems).orderBy(asc(packagingItems.name)),
      database.select().from(globalSettings).where(eq(globalSettings.id, 1)).limit(1),
    ]);

  const settings = settingsRows[0];
  if (!settings) {
    throw new Error('Recipe costing settings are missing.');
  }

  const ingredientsById = new Map(ingredientRows.map((item) => [item.id, item]));
  const conversionsByIngredient = new Map<string, typeof conversionRows>();
  for (const conversion of conversionRows) {
    const current = conversionsByIngredient.get(conversion.ingredientId) ?? [];
    current.push(conversion);
    conversionsByIngredient.set(conversion.ingredientId, current);
  }
  const recipesById = new Map(recipeRows.map((recipe) => [recipe.id, recipe]));
  const itemsByRecipe = new Map<string, typeof itemRows>();
  for (const item of itemRows) {
    const current = itemsByRecipe.get(item.recipeId) ?? [];
    current.push(item);
    itemsByRecipe.set(item.recipeId, current);
  }
  const packagingById = new Map(packagingRows.map((item) => [item.id, item]));
  const builtRecipes = new Map<string, RecipeCostInput>();
  const buildingRecipes = new Set<string>();

  const buildCostInput = (recipeId: string): RecipeCostInput | undefined => {
    const cached = builtRecipes.get(recipeId);
    if (cached) {
      return cached;
    }
    if (buildingRecipes.has(recipeId)) {
      throw new Error('Saved recipe links contain a cycle.');
    }
    const recipe = recipesById.get(recipeId);
    if (!recipe) {
      return undefined;
    }
    buildingRecipes.add(recipeId);

    const lines: RecipeCostLine[] = [];
    for (const item of itemsByRecipe.get(recipeId) ?? []) {
      if (item.kind === 'ingredient') {
        const ingredient = ingredientsById.get(item.referenceId);
        if (!ingredient) {
          lines.push({
            id: item.id,
            kind: item.kind,
            name: '',
            quantity: item.quantity,
            unit: item.unit,
          });
          continue;
        }
        lines.push({
          id: item.id,
          kind: 'ingredient',
          name: ingredient.name,
          quantity: item.quantity,
          unit: item.unit,
          ingredient: {
            id: ingredient.id,
            name: ingredient.name,
            purchaseUnit: ingredient.purchaseUnit,
            purchaseQuantity: ingredient.purchaseQuantity,
            purchasePriceMinor: ingredient.purchasePriceMinor,
            usableYieldPct: ingredient.usableYieldPct,
            conversions: conversionsByIngredient.get(ingredient.id) ?? [],
          },
        });
      } else if (item.kind === 'recipe') {
        const childRecipe = buildCostInput(item.referenceId);
        const childRecord = recipesById.get(item.referenceId);
        lines.push({
          id: item.id,
          kind: 'recipe',
          name: childRecord?.name ?? '',
          quantity: item.quantity,
          unit: item.unit,
          detail: childRecipe,
        });
      } else {
        const packaging = packagingById.get(item.referenceId);
        lines.push({
          id: item.id,
          kind: 'packaging',
          name: packaging?.name ?? '',
          quantity: item.quantity,
          unit: item.unit,
          packaging,
        });
      }
    }

    const input: RecipeCostInput = {
      id: recipe.id,
      isSubRecipe: recipe.isSubRecipe,
      portions: recipe.portions,
      batchYieldQuantity: recipe.batchYieldQuantity,
      batchYieldUnit: recipe.batchYieldUnit,
      laborMinutes: recipe.laborMinutes,
      laborRateMinor: recipe.laborRateMinor,
      overheadMode: recipe.overheadMode,
      overheadValue: recipe.overheadValue,
      items: lines,
    };
    buildingRecipes.delete(recipeId);
    builtRecipes.set(recipeId, input);
    return input;
  };

  const recipeEdges: RecipeEdge[] = itemRows
    .filter((item) => item.kind === 'recipe')
    .map((item) => ({ recipeId: item.recipeId, childRecipeId: item.referenceId }));

  const recipeCostInputs = recipeRows
    .map((recipe) => buildCostInput(recipe.id))
    .filter((recipe): recipe is RecipeCostInput => recipe !== undefined);

  return {
    recipes: recipeRows,
    itemsByRecipe,
    ingredients: ingredientRows,
    conversionsByIngredient,
    packagingItems: packagingRows,
    wastePct: settings.wastePct,
    buildCostInput,
    recipeEdges,
    recipeCostInputs,
  };
}

export async function listRecipeSummaries(database: AppDatabase, fractionDigits: number) {
  const context = await loadCostingContext(database);
  return context.recipes.map((recipe) => {
    const costInput = context.buildCostInput(recipe.id);
    if (!costInput) {
      throw new Error(`Recipe "${recipe.name}" could not be loaded.`);
    }
    const result = calculateRecipeCost(costInput, context.wastePct, fractionDigits);
    return {
      recipe,
      costPerUnit: (recipe.isSubRecipe ? result.costPerYieldUnit : result.costPerPortion).toString(),
      batchCost: result.batchCost.toString(),
      itemCount: context.itemsByRecipe.get(recipe.id)?.length ?? 0,
    } satisfies RecipeSummary;
  });
}

export async function getRecipeEditorData(database: AppDatabase, id: string, fractionDigits: number) {
  const context = await loadCostingContext(database);
  const recipe = context.recipes.find((item) => item.id === id);
  if (!recipe) {
    return undefined;
  }

  const costInput = context.buildCostInput(recipe.id);
  if (!costInput) {
    return undefined;
  }
  const cost = calculateRecipeCost(costInput, context.wastePct, fractionDigits);
  return {
    recipe,
    items: context.itemsByRecipe.get(id) ?? [],
    ingredients: context.ingredients,
    conversionsByIngredient: context.conversionsByIngredient,
    recipes: context.recipes,
    packagingItems: context.packagingItems,
    recipeEdges: context.recipeEdges,
    recipeCostInputs: context.recipeCostInputs,
    cost,
    wastePct: context.wastePct,
  };
}

export async function getRecipeWorkspace(database: AppDatabase) {
  const context = await loadCostingContext(database);
  return {
    ingredients: context.ingredients,
    conversionsByIngredient: context.conversionsByIngredient,
    recipes: context.recipes,
    packagingItems: context.packagingItems,
    wastePct: context.wastePct,
    recipeEdges: context.recipeEdges,
    recipeCostInputs: context.recipeCostInputs,
  };
}

export async function saveRecipe(database: AppDatabase, input: RecipeInput) {
  const now = new Date().toISOString();
  return database.transaction(async (transaction) => {
    const existing = await transaction.select().from(recipes);
    const existingItems = await transaction.select().from(recipeItems);
    const availableIngredients = new Set(
      (await transaction.select({ id: ingredients.id }).from(ingredients)).map((item) => item.id),
    );
    const availablePackaging = new Set(
      (await transaction.select({ id: packagingItems.id }).from(packagingItems)).map(
        (item) => item.id,
      ),
    );
    const recipesById = new Map(existing.map((recipe) => [recipe.id, recipe]));
    let recipeId = input.id;

    if (recipeId && !existing.some((recipe) => recipe.id === recipeId)) {
      throw new Error('This recipe no longer exists.');
    }

    if (input.id) {
      const currentRecipeId = input.id;
      const graphWithoutCurrent = existingItems
        .filter((item) => item.kind === 'recipe' && item.recipeId !== currentRecipeId)
        .map((item) => ({ recipeId: item.recipeId, childRecipeId: item.referenceId }));
      const children = input.items.filter((item) => item.kind === 'recipe');
      if (
        children.some((child) =>
          detectCycle(currentRecipeId, child.referenceId, graphWithoutCurrent),
        )
      ) {
        throw new RecipeCycleError();
      }
      await transaction
        .update(recipes)
        .set({
          name: input.name,
          portions: input.portions,
          batchYieldQuantity: input.batchYieldQuantity,
          batchYieldUnit: input.batchYieldUnit,
          isSubRecipe: input.isSubRecipe,
          sellingPriceMinor: input.sellingPriceMinor,
          notes: input.notes || null,
          laborMinutes: input.laborMinutes,
          laborRateMinor: input.laborRateMinor,
          overheadMode: input.overheadMode,
          overheadValue: input.overheadValue,
          updatedAt: now,
        })
        .where(eq(recipes.id, currentRecipeId));
    } else {
      const [created] = await transaction
        .insert(recipes)
        .values({
          name: input.name,
          portions: input.portions,
          batchYieldQuantity: input.batchYieldQuantity,
          batchYieldUnit: input.batchYieldUnit,
          isSubRecipe: input.isSubRecipe,
          sellingPriceMinor: input.sellingPriceMinor,
          notes: input.notes || null,
          laborMinutes: input.laborMinutes,
          laborRateMinor: input.laborRateMinor,
          overheadMode: input.overheadMode,
          overheadValue: input.overheadValue,
          updatedAt: now,
        })
        .returning({ id: recipes.id });
      recipeId = created.id;
    }

    if (!recipeId) {
      throw new Error('Recipe could not be saved.');
    }
    const storedRecipeId = recipeId;
    for (const item of input.items) {
      if (item.kind === 'ingredient' && !availableIngredients.has(item.referenceId)) {
        throw new MissingRecipeReferenceError();
      }
      if (item.kind === 'packaging' && !availablePackaging.has(item.referenceId)) {
        throw new MissingRecipeReferenceError();
      }
      if (item.kind === 'recipe') {
        if (item.referenceId === storedRecipeId) {
          throw new RecipeCycleError();
        }
        const childRecipe = recipesById.get(item.referenceId);
        if (!childRecipe) {
          throw new MissingRecipeReferenceError();
        }
        if (!childRecipe.isSubRecipe) {
          throw new InvalidSubRecipeError();
        }
      }
    }
    await transaction.delete(recipeItems).where(eq(recipeItems.recipeId, storedRecipeId));
    if (input.items.length > 0) {
      await transaction.insert(recipeItems).values(
        input.items.map((item) => ({
          recipeId: storedRecipeId,
          kind: item.kind,
          referenceId: item.referenceId,
          quantity: item.quantity,
          unit: item.unit,
        })),
      );
    }
    const usedIngredients = input.items
      .filter((item) => item.kind === 'ingredient')
      .map((item) => item.referenceId);
    if (usedIngredients.length > 0) {
      await transaction
        .update(ingredients)
        .set({ lastUsedAt: now })
        .where(inArray(ingredients.id, usedIngredients));
    }

    return storedRecipeId;
  });
}

export async function savePackagingItem(
  database: AppDatabase,
  name: string,
  costMinor: number,
) {
  const [created] = await database
    .insert(packagingItems)
    .values({ name, costMinor, updatedAt: new Date().toISOString() })
    .returning({ id: packagingItems.id });
  return created;
}

export async function getRecipeItems(database: AppDatabase, id: string) {
  return database.select().from(recipeItems).where(eq(recipeItems.recipeId, id));
}
