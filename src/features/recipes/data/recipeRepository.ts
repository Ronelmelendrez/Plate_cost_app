import { Decimal } from 'decimal.js';
import { and, asc, eq, inArray } from 'drizzle-orm';

import {
  calculateRecipeCost,
  InvalidPackagingOnSubRecipeError,
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
  channels,
  recipeChannelPrices,
  recipeItems,
  recipePackaging,
  recipePackagingChannels,
  recipes,
  unitConversions,
} from '@core/db/schema';
import {
  isUnitMismatchError,
  unitBase,
  type RecipeUnit,
  type RecipeUnitSizes,
  type RecipeYieldUnit,
} from '@core/costing/units';
import {
  getAppSettings,
  listSalesChannels,
} from '@features/settings/data/settingsRepository';
import type { RecipePackagingDraft } from '@features/packaging';

export type Recipe = typeof recipes.$inferSelect;
export type RecipeChannelPrice = typeof recipeChannelPrices.$inferSelect;

export interface RecipeItemDraft {
  id: string;
  kind: 'ingredient' | 'recipe';
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
  imageUri?: string | null;
  items: RecipeItemDraft[];
  packaging: RecipePackagingDraft[];
  channelPrices?: { channelId: string; priceMinor: number }[];
}

export interface RecipeSummary {
  recipe: Recipe;
  costPerUnit?: string;
  batchCost?: string;
  itemCount: number;
}

export class RecipeUnitChangeInUseError extends Error {
  constructor(readonly affectedCount: number) {
    super('The sub-recipe yield unit cannot change while linked recipe lines use a different unit family.');
    this.name = 'RecipeUnitChangeInUseError';
  }
}

async function loadCostingContext(database: AppDatabase) {
  const initializedSettings = await getAppSettings(database);
  const [
    recipeRows,
    itemRows,
    ingredientRows,
    conversionRows,
    packagingRows,
    recipePackagingRows,
    recipePackagingChannelRows,
    settingsRows,
    channelRows,
    channelPriceRows,
  ] =
    await Promise.all([
      database.select().from(recipes).orderBy(asc(recipes.name)),
      database.select().from(recipeItems),
      database.select().from(ingredients).orderBy(asc(ingredients.name)),
      database.select().from(unitConversions),
      database.select().from(packagingItems).orderBy(asc(packagingItems.name)),
      database.select().from(recipePackaging),
      database.select().from(recipePackagingChannels),
      database.select().from(globalSettings).where(eq(globalSettings.id, 1)).limit(1),
      listSalesChannels(database),
      database.select().from(recipeChannelPrices),
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
  const packagingByRecipe = new Map<
    string,
    {
      line: (typeof recipePackagingRows)[number];
      channelIds: string[];
    }[]
  >();
  for (const line of recipePackagingRows) {
    const current = packagingByRecipe.get(line.recipeId) ?? [];
    current.push({
      line,
      channelIds: recipePackagingChannelRows
        .filter((channel) => channel.recipePackagingId === line.id)
        .map((channel) => channel.channelId),
    });
    packagingByRecipe.set(line.recipeId, current);
  }
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
      }
    }

    const packagingLines = recipe.isSubRecipe
      ? []
      : (packagingByRecipe.get(recipeId) ?? []).map(({ line, channelIds }) => {
          const packaging = packagingById.get(line.packagingId);
          if (!packaging) {
            throw new MissingRecipeReferenceError();
          }
          return {
            id: line.id,
            packagingId: line.packagingId,
            name: packaging.name,
            quantityPerPortion: line.qtyPerPortion,
            packPriceMinor: packaging.packPriceMinor,
            piecesPerPack: packaging.piecesPerPack,
            appliesTo: line.appliesTo,
            channelIds,
          };
        });
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
      channelIds: channelRows.map((channel) => channel.id),
      items: lines,
      packaging: packagingLines,
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
    settings: initializedSettings,
    unitSizes: {
      cupMl: initializedSettings.cupMl,
      tablespoonMl: initializedSettings.tablespoonMl,
    } satisfies RecipeUnitSizes,
    buildCostInput,
    recipeEdges,
    recipeCostInputs,
    channels: channelRows,
    channelPrices: channelPriceRows,
  };
}

export async function listRecipeSummaries(database: AppDatabase, fractionDigits: number) {
  const context = await loadCostingContext(database);
  return context.recipes.map((recipe) => {
    const costInput = context.buildCostInput(recipe.id);
    if (!costInput) {
      throw new Error(`Recipe "${recipe.name}" could not be loaded.`);
    }
    let result: ReturnType<typeof calculateRecipeCost> | undefined;
    try {
      result = calculateRecipeCost(
        costInput,
        context.wastePct,
        fractionDigits,
        context.unitSizes,
      );
    } catch (error) {
      if (!isUnitMismatchError(error)) {
        throw error;
      }
    }
    return {
      recipe,
      costPerUnit: result
        ? (recipe.isSubRecipe
            ? result.foodCostPerYieldUnit
            : result.foodCostPerPortion.plus(
                result.packagingCostByChannel['dine-in'] ?? new Decimal(0),
              )
          ).toString()
        : undefined,
      batchCost: result?.batchFoodCost.toString(),
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
  let cost: ReturnType<typeof calculateRecipeCost> | undefined;
  try {
    cost = calculateRecipeCost(
      costInput,
      context.wastePct,
      fractionDigits,
      context.unitSizes,
    );
  } catch (error) {
    if (!isUnitMismatchError(error)) {
      throw error;
    }
  }
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
    settings: context.settings,
    channels: context.channels,
    channelPrices: context.channelPrices.filter((price) => price.recipeId === id),
    packaging: costInput.packaging.map(
      ({ id: lineId, packagingId, quantityPerPortion, appliesTo, channelIds }) => ({
        id: lineId,
        packagingId,
        quantityPerPortion,
        appliesTo,
        channelIds,
      }),
    ),
    unitSizes: context.unitSizes,
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
    settings: context.settings,
    channels: context.channels,
    channelPrices: context.channelPrices,
    unitSizes: context.unitSizes,
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
    const availableChannels = new Set(
      (await transaction.select({ id: channels.id }).from(channels)).map((item) => item.id),
    );
    const recipesById = new Map(existing.map((recipe) => [recipe.id, recipe]));
    let recipeId = input.id;

    if (recipeId && !existing.some((recipe) => recipe.id === recipeId)) {
      throw new Error('This recipe no longer exists.');
    }

    if (input.id) {
      const currentRecipeId = input.id;
      const currentRecipe = recipesById.get(currentRecipeId);
      if (
        currentRecipe?.isSubRecipe &&
        input.isSubRecipe &&
        unitBase(currentRecipe.batchYieldUnit) !== unitBase(input.batchYieldUnit)
      ) {
        const incompatibleLines = existingItems.filter(
          (item) =>
            item.kind === 'recipe' &&
            item.referenceId === currentRecipeId &&
            unitBase(item.unit) !== unitBase(input.batchYieldUnit),
        );
        if (incompatibleLines.length > 0) {
          throw new RecipeUnitChangeInUseError(incompatibleLines.length);
        }
      }
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
          imageUri: input.imageUri ?? null,
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
          imageUri: input.imageUri ?? null,
          updatedAt: now,
        })
        .returning({ id: recipes.id });
      recipeId = created.id;
    }

    if (!recipeId) {
      throw new Error('Recipe could not be saved.');
    }
    const storedRecipeId = recipeId;
    if (input.isSubRecipe && input.packaging.length > 0) {
      throw new InvalidPackagingOnSubRecipeError();
    }
    for (const item of input.items) {
      if (item.kind === 'ingredient' && !availableIngredients.has(item.referenceId)) {
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
    for (const line of input.packaging) {
      if (!availablePackaging.has(line.packagingId)) {
        throw new MissingRecipeReferenceError();
      }
      if (!new Decimal(line.quantityPerPortion).isFinite() || new Decimal(line.quantityPerPortion).lte(0)) {
        throw new Error('Packaging quantity per portion must be greater than zero.');
      }
      if (
        line.appliesTo === 'selected' &&
        (line.channelIds.length === 0 ||
          line.channelIds.some((channelId) => !availableChannels.has(channelId)))
      ) {
        throw new Error('Selected packaging channels must include at least one valid channel.');
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
    if (!input.isSubRecipe) {
      const currentPackagingLines = await transaction
        .select({ id: recipePackaging.id })
        .from(recipePackaging)
        .where(eq(recipePackaging.recipeId, storedRecipeId));
      const lineIds = currentPackagingLines.map((line) => line.id);
      if (lineIds.length > 0) {
        await transaction
          .delete(recipePackagingChannels)
          .where(inArray(recipePackagingChannels.recipePackagingId, lineIds));
      }
      await transaction
        .delete(recipePackaging)
        .where(eq(recipePackaging.recipeId, storedRecipeId));
      if (input.packaging.length > 0) {
        await transaction.insert(recipePackaging).values(
          input.packaging.map((line) => ({
            id: line.id,
            recipeId: storedRecipeId,
            packagingId: line.packagingId,
            qtyPerPortion: line.quantityPerPortion,
            appliesTo: line.appliesTo,
          })),
        );
        const selectedChannels = input.packaging.flatMap((line) =>
          line.appliesTo === 'selected'
            ? line.channelIds.map((channelId) => ({
                recipePackagingId: line.id,
                channelId,
              }))
            : [],
        );
        if (selectedChannels.length > 0) {
          await transaction.insert(recipePackagingChannels).values(selectedChannels);
        }
      }
    }
    const channelPrices =
      input.channelPrices ??
      (input.sellingPriceMinor === null
        ? []
        : [{ channelId: 'dine-in', priceMinor: input.sellingPriceMinor }]);
    const savedChannelIds = new Set<string>();
    for (const price of channelPrices) {
      if (!availableChannels.has(price.channelId)) {
        throw new MissingRecipeReferenceError();
      }
      if (
        !Number.isSafeInteger(price.priceMinor) ||
        price.priceMinor <= 0 ||
        savedChannelIds.has(price.channelId)
      ) {
        throw new Error('Recipe channel prices must be positive, unique minor-unit amounts.');
      }
      savedChannelIds.add(price.channelId);
    }
    if ((!input.isSubRecipe && channelPrices.length === 0) || (input.isSubRecipe && channelPrices.length > 0)) {
      throw new Error('Only dishes require sales channel prices.');
    }
    await transaction.delete(recipeChannelPrices).where(eq(recipeChannelPrices.recipeId, storedRecipeId));
    if (channelPrices.length > 0) {
      await transaction.insert(recipeChannelPrices).values(
        channelPrices.map((price) => ({
          recipeId: storedRecipeId,
          channelId: price.channelId,
          priceMinor: price.priceMinor,
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
    const usedPackaging = input.packaging.map((line) => line.packagingId);
    if (usedPackaging.length > 0) {
      await transaction
        .update(packagingItems)
        .set({ lastUsedAt: now })
        .where(inArray(packagingItems.id, usedPackaging));
    }

    return storedRecipeId;
  });
}

export async function saveRecipeChannelPrice(
  database: AppDatabase,
  recipeId: string,
  channelId: string,
  priceMinor: number,
) {
  if (!Number.isSafeInteger(priceMinor) || priceMinor <= 0) {
    throw new Error('A recipe channel price must be a positive minor-unit amount.');
  }

  await database.transaction(async (transaction) => {
    const [recipe] = await transaction
      .select({ id: recipes.id, isSubRecipe: recipes.isSubRecipe })
      .from(recipes)
      .where(eq(recipes.id, recipeId))
      .limit(1);
    if (!recipe) {
      throw new Error('This recipe no longer exists.');
    }
    if (recipe.isSubRecipe) {
      throw new Error('Only dishes can have sales channel prices.');
    }

    const [channel] = await transaction
      .select({ id: channels.id })
      .from(channels)
      .where(eq(channels.id, channelId))
      .limit(1);
    if (!channel) {
      throw new Error('This sales channel no longer exists.');
    }

    const [existingPrice] = await transaction
      .select({ id: recipeChannelPrices.id })
      .from(recipeChannelPrices)
      .where(
        and(
          eq(recipeChannelPrices.recipeId, recipeId),
          eq(recipeChannelPrices.channelId, channelId),
        ),
      )
      .limit(1);
    if (existingPrice) {
      await transaction
        .update(recipeChannelPrices)
        .set({ priceMinor })
        .where(eq(recipeChannelPrices.id, existingPrice.id));
    } else {
      await transaction.insert(recipeChannelPrices).values({
        recipeId,
        channelId,
        priceMinor,
      });
    }

    if (channelId === 'dine-in') {
      await transaction
        .update(recipes)
        .set({ sellingPriceMinor: priceMinor, updatedAt: new Date().toISOString() })
        .where(eq(recipes.id, recipeId));
    }
  });
}

export async function getRecipeItems(database: AppDatabase, id: string) {
  return database.select().from(recipeItems).where(eq(recipeItems.recipeId, id));
}
