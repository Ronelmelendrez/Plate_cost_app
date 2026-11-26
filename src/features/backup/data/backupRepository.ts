import type { AppDatabase } from '@core/db/client';
import {
  channels,
  globalSettings,
  ingredientPriceHistory,
  ingredients,
  packagingItems,
  recipeChannelPrices,
  recipeItems,
  recipes,
  unitConversions,
} from '@core/db/schema';

import type { BackupV1 } from '../domain/backupFormat';

export interface BackupMergeResult {
  addedCount: number;
}

export async function createBackup(database: AppDatabase): Promise<BackupV1> {
  return database.transaction(async (transaction) => {
    const ingredientRows = await transaction.select().from(ingredients);
    const conversionRows = await transaction.select().from(unitConversions);
    const historyRows = await transaction.select().from(ingredientPriceHistory);
    const recipeRows = await transaction.select().from(recipes);
    const recipeItemRows = await transaction.select().from(recipeItems);
    const packagingRows = await transaction.select().from(packagingItems);
    const settingsRows = await transaction.select().from(globalSettings);
    const channelRows = await transaction.select().from(channels);
    const priceRows = await transaction.select().from(recipeChannelPrices);
    const settings = settingsRows[0];
    if (!settings) {
      throw new Error('Global settings are missing; backup could not be created.');
    }

    return {
      format: 'platecost-backup',
      schema_version: 1,
      exported_at: new Date().toISOString(),
      tables: {
        ingredients: ingredientRows,
        unit_conversions: conversionRows,
        ingredient_price_history: historyRows,
        recipes: recipeRows,
        recipe_items: recipeItemRows,
        packaging_items: packagingRows,
        global_settings: {
          id: 1,
          locale: settings.locale,
          currency_code: settings.currencyCode,
          unit_system: settings.unitSystem,
          cup_ml: settings.cupMl,
          tablespoon_ml: settings.tablespoonMl,
          prices_include_tax: settings.pricesIncludeTax,
          tax_pct: settings.taxPct,
          waste_pct: settings.wastePct,
          target_margin_pct: settings.targetMarginPct,
          fees_on_tax_included_price: settings.feesOnTaxIncludedPrice,
          rounding_rule: settings.roundingRule,
          is_initialized: settings.isInitialized,
        },
        channels: channelRows,
        recipe_channel_prices: priceRows,
      },
    };
  });
}

export async function mergeBackup(
  database: AppDatabase,
  backup: BackupV1,
): Promise<BackupMergeResult> {
  return database.transaction(async (transaction) => {
    const insertedIngredients = backup.tables.ingredients.length
      ? await transaction
          .insert(ingredients)
          .values(backup.tables.ingredients)
          .onConflictDoNothing()
          .returning({ id: ingredients.id })
      : [];
    const insertedRecipes = backup.tables.recipes.length
      ? await transaction
          .insert(recipes)
          .values(backup.tables.recipes)
          .onConflictDoNothing()
          .returning({ id: recipes.id })
      : [];
    const insertedPackaging = backup.tables.packaging_items.length
      ? await transaction
          .insert(packagingItems)
          .values(backup.tables.packaging_items)
          .onConflictDoNothing()
          .returning({ id: packagingItems.id })
      : [];
    const insertedChannels = backup.tables.channels.length
      ? await transaction
          .insert(channels)
          .values(backup.tables.channels)
          .onConflictDoNothing()
          .returning({ id: channels.id })
      : [];
    const insertedSettings = await transaction
      .insert(globalSettings)
      .values({
        id: backup.tables.global_settings.id,
        locale: backup.tables.global_settings.locale,
        currencyCode: backup.tables.global_settings.currency_code,
        unitSystem: backup.tables.global_settings.unit_system,
        cupMl: backup.tables.global_settings.cup_ml,
        tablespoonMl: backup.tables.global_settings.tablespoon_ml,
        pricesIncludeTax: backup.tables.global_settings.prices_include_tax,
        taxPct: backup.tables.global_settings.tax_pct,
        wastePct: backup.tables.global_settings.waste_pct,
        targetMarginPct: backup.tables.global_settings.target_margin_pct,
        feesOnTaxIncludedPrice: backup.tables.global_settings.fees_on_tax_included_price,
        roundingRule: backup.tables.global_settings.rounding_rule,
        isInitialized: backup.tables.global_settings.is_initialized,
      })
      .onConflictDoNothing()
      .returning({ id: globalSettings.id });
    const newIngredientIds = new Set(insertedIngredients.map((row) => row.id));
    const newRecipeIds = new Set(insertedRecipes.map((row) => row.id));
    const conversionsToAdd = backup.tables.unit_conversions.filter((row) =>
      newIngredientIds.has(row.ingredientId),
    );
    const recipeItemsToAdd = backup.tables.recipe_items.filter((row) =>
      newRecipeIds.has(row.recipeId),
    );
    const recipePricesToAdd = backup.tables.recipe_channel_prices.filter((row) =>
      newRecipeIds.has(row.recipeId),
    );
    const insertedConversions = conversionsToAdd.length
      ? await transaction
          .insert(unitConversions)
          .values(conversionsToAdd)
          .onConflictDoNothing()
          .returning({ id: unitConversions.id })
      : [];
    const insertedHistory = backup.tables.ingredient_price_history.length
      ? await transaction
          .insert(ingredientPriceHistory)
          .values(backup.tables.ingredient_price_history)
          .onConflictDoNothing()
          .returning({ id: ingredientPriceHistory.id })
      : [];
    const insertedRecipeItems = recipeItemsToAdd.length
      ? await transaction
          .insert(recipeItems)
          .values(recipeItemsToAdd)
          .onConflictDoNothing()
          .returning({ id: recipeItems.id })
      : [];
    const insertedPrices = recipePricesToAdd.length
      ? await transaction
          .insert(recipeChannelPrices)
          .values(recipePricesToAdd)
          .onConflictDoNothing()
          .returning({ id: recipeChannelPrices.id })
      : [];

    return {
      addedCount:
        insertedIngredients.length +
        insertedRecipes.length +
        insertedPackaging.length +
        insertedChannels.length +
        insertedSettings.length +
        insertedConversions.length +
        insertedHistory.length +
        insertedRecipeItems.length +
        insertedPrices.length,
    };
  });
}
