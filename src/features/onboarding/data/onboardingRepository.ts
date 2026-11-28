import { Decimal } from 'decimal.js';
import { eq } from 'drizzle-orm';

import type { AppDatabase } from '@core/db/client';
import { quantityInBaseUnits } from '@core/costing/units';
import {
  channels,
  globalSettings,
  ingredientPriceHistory,
  ingredients,
  recipeChannelPrices,
  recipeItems,
  recipes,
} from '@core/db/schema';

import type { StarterChannelTemplate, StarterIngredientTemplate } from './starterTemplates';

export interface OnboardingDishInput {
  name: string;
  ingredients: {
    template: StarterIngredientTemplate;
    priceMinor: number;
    recipeQuantity: string;
  }[];
  sellingPriceMinor: number;
}

function assertPositiveAmount(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive minor-unit amount.`);
  }
}

function canonicalQuantity(value: string) {
  const quantity = new Decimal(value);
  if (!quantity.isFinite() || quantity.lte(0)) {
    throw new Error('Recipe quantities must be positive.');
  }
  return quantity.toString();
}

async function ensureChannels(
  database: AppDatabase,
  channelTemplates: StarterChannelTemplate[],
) {
  await database.transaction(async (transaction) => {
    const existingChannels = await transaction.select({ id: channels.id }).from(channels);
    const existingIds = new Set(existingChannels.map((channel) => channel.id));
    const missingChannels = channelTemplates
      .filter((channel) => !existingIds.has(channel.id))
      .map((channel) => ({
        id: channel.id,
        name: channel.name,
        commissionPct: channel.commissionPct,
        paymentFeePct: channel.paymentFeePct,
        isDefault: channel.isDefault,
      }));

    if (missingChannels.length > 0) {
      await transaction.insert(channels).values(missingChannels).onConflictDoNothing();
    }
  });
}

export async function isOnboardingCompleted(database: AppDatabase) {
  const [settings] = await database
    .select({ onboardingCompleted: globalSettings.onboardingCompleted })
    .from(globalSettings)
    .where(eq(globalSettings.id, 1))
    .limit(1);
  if (!settings) {
    throw new Error('Global settings are missing from the database.');
  }
  return settings.onboardingCompleted;
}

export async function completeOnboarding(database: AppDatabase) {
  const [updated] = await database
    .update(globalSettings)
    .set({ onboardingCompleted: true, isInitialized: true })
    .where(eq(globalSettings.id, 1))
    .returning({ id: globalSettings.id });
  if (!updated) {
    throw new Error('Onboarding completion could not be saved.');
  }
}

export async function ensureStarterChannels(
  database: AppDatabase,
  channelTemplates: StarterChannelTemplate[],
) {
  await ensureChannels(database, channelTemplates);
}

export async function saveOnboardingDish(
  database: AppDatabase,
  channelTemplates: StarterChannelTemplate[],
  input: OnboardingDishInput,
) {
  if (input.ingredients.length !== 3) {
    throw new Error('Choose exactly three ingredients to create the starter dish.');
  }
  if (!input.name.trim()) {
    throw new Error('The starter dish needs a name.');
  }
  assertPositiveAmount(input.sellingPriceMinor, 'Selling price');
  for (const ingredient of input.ingredients) {
    assertPositiveAmount(ingredient.priceMinor, 'Ingredient price');
    canonicalQuantity(ingredient.template.purchaseQuantity);
    canonicalQuantity(ingredient.recipeQuantity);
  }
  await ensureChannels(database, channelTemplates);
  const now = new Date().toISOString();
  return database.transaction(async (transaction) => {
    const [defaultChannel] = await transaction
      .select({ id: channels.id })
      .from(channels)
      .where(eq(channels.id, 'dine-in'))
      .limit(1);
    if (!defaultChannel) {
      throw new Error('The dine-in sales channel could not be created.');
    }

    const ingredientItems = [];
    for (const row of input.ingredients) {
      const [createdIngredient] = await transaction
        .insert(ingredients)
        .values({
          name: row.template.name,
          purchaseUnit: row.template.purchaseUnit,
          purchaseQuantity: canonicalQuantity(row.template.purchaseQuantity),
          purchasePriceMinor: row.priceMinor,
          usableYieldPct: '100',
          lastUsedAt: now,
          updatedAt: now,
        })
        .returning({ id: ingredients.id });
      if (!createdIngredient) {
        throw new Error(`Ingredient "${row.template.name}" could not be saved.`);
      }

      await transaction.insert(ingredientPriceHistory).values({
        ingredientId: createdIngredient.id,
        priceMinor: row.priceMinor,
        purchaseQuantity: canonicalQuantity(row.template.purchaseQuantity),
        purchaseUnit: row.template.purchaseUnit,
        purchaseBaseQuantity: quantityInBaseUnits(
          canonicalQuantity(row.template.purchaseQuantity),
          row.template.purchaseUnit,
        ).quantity.toString(),
        purchaseBaseUnit: quantityInBaseUnits(
          canonicalQuantity(row.template.purchaseQuantity),
          row.template.purchaseUnit,
        ).unit,
        usableYieldPct: '100',
        recordedAt: now,
      });
      ingredientItems.push({
        kind: 'ingredient' as const,
        referenceId: createdIngredient.id,
        quantity: canonicalQuantity(row.recipeQuantity),
        unit: row.template.recipeUnit,
      });
    }

    const [createdRecipe] = await transaction
      .insert(recipes)
      .values({
        name: input.name.trim(),
        portions: 1,
        batchYieldQuantity: '1',
        batchYieldUnit: 'portion',
        isSubRecipe: false,
        sellingPriceMinor: input.sellingPriceMinor,
        notes: '',
        laborMinutes: '0',
        laborRateMinor: 0,
        overheadMode: 'none',
        overheadValue: '0',
        updatedAt: now,
      })
      .returning({ id: recipes.id });
    if (!createdRecipe) {
      throw new Error('The starter dish could not be saved.');
    }

    await transaction.insert(recipeItems).values(
      ingredientItems.map((item) => ({
        recipeId: createdRecipe.id,
        ...item,
      })),
    );
    await transaction.insert(recipeChannelPrices).values({
      recipeId: createdRecipe.id,
      channelId: defaultChannel.id,
      priceMinor: input.sellingPriceMinor,
    });
    const [updatedSettings] = await transaction
      .update(globalSettings)
      .set({ onboardingCompleted: true, isInitialized: true })
      .where(eq(globalSettings.id, 1))
      .returning({ id: globalSettings.id });
    if (!updatedSettings) {
      throw new Error('Onboarding completion could not be saved.');
    }

    return createdRecipe.id;
  });
}
