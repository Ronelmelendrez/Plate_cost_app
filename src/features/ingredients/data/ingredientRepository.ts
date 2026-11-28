import { asc, desc, eq, inArray } from 'drizzle-orm';

import type { AppDatabase } from '@core/db/client';
import {
  quantityInBaseUnits,
  type BaseUnit,
  type ConversionUnit,
  type PurchaseUnit,
} from '@core/costing/units';
import { ingredientPriceHistory, ingredients, unitConversions } from '@core/db/schema';

export type Ingredient = typeof ingredients.$inferSelect;
export type IngredientConversion = typeof unitConversions.$inferSelect;
export type IngredientPriceRecord = typeof ingredientPriceHistory.$inferSelect;
export type IngredientListItem = Ingredient & { conversions: IngredientConversion[] };

export interface IngredientInput {
  id?: string;
  name: string;
  purchaseUnit: PurchaseUnit;
  purchaseQuantity: string;
  purchasePriceMinor: number;
  usableYieldPct: string;
  conversions: {
    fromUnit: ConversionUnit;
    baseQuantity: string;
    baseUnit: BaseUnit;
  }[];
}

export async function listIngredients(database: AppDatabase, searchTerm: string) {
  const found = await database
    .select()
    .from(ingredients)
    .orderBy(
      desc(ingredients.isFavourite),
      desc(ingredients.lastUsedAt),
      asc(ingredients.name),
    );
  const search = searchTerm.trim().toLocaleLowerCase();
  const filtered = search
    ? found.filter((ingredient) => ingredient.name.toLocaleLowerCase().includes(search))
    : found;
  if (filtered.length === 0) {
    return [];
  }
  const conversions = await database
    .select()
    .from(unitConversions)
    .where(inArray(unitConversions.ingredientId, filtered.map((ingredient) => ingredient.id)));
  const conversionsByIngredient = new Map<string, IngredientConversion[]>();
  for (const conversion of conversions) {
    const rows = conversionsByIngredient.get(conversion.ingredientId) ?? [];
    rows.push(conversion);
    conversionsByIngredient.set(conversion.ingredientId, rows);
  }
  return filtered.map((ingredient) => ({
    ...ingredient,
    conversions: conversionsByIngredient.get(ingredient.id) ?? [],
  }));
}

export async function getIngredient(database: AppDatabase, id: string) {
  const [ingredient] = await database
    .select()
    .from(ingredients)
    .where(eq(ingredients.id, id))
    .limit(1);
  return ingredient;
}

export async function getIngredientConversions(database: AppDatabase, id: string) {
  return database
    .select()
    .from(unitConversions)
    .where(eq(unitConversions.ingredientId, id))
    .orderBy(asc(unitConversions.fromUnit));
}

export async function getIngredientPriceHistory(database: AppDatabase, id: string) {
  return database
    .select()
    .from(ingredientPriceHistory)
    .where(eq(ingredientPriceHistory.ingredientId, id))
    .orderBy(desc(ingredientPriceHistory.recordedAt));
}

export async function saveIngredient(database: AppDatabase, input: IngredientInput) {
  const now = new Date().toISOString();
  const purchaseConversion = input.conversions.find(
    (conversion) => conversion.fromUnit === input.purchaseUnit,
  );
  const purchaseBaseAmount = quantityInBaseUnits(
    input.purchaseQuantity,
    input.purchaseUnit,
    purchaseConversion,
  );
  const priceHistoryValues = {
    priceMinor: input.purchasePriceMinor,
    purchaseQuantity: input.purchaseQuantity,
    purchaseUnit: input.purchaseUnit,
    purchaseBaseQuantity: purchaseBaseAmount.quantity.toString(),
    purchaseBaseUnit: purchaseBaseAmount.unit,
    usableYieldPct: input.usableYieldPct,
    recordedAt: now,
  };
  return database.transaction(async (transaction) => {
    let ingredientId: string;
    const updatedValues = {
      name: input.name,
      purchaseUnit: input.purchaseUnit,
      purchaseQuantity: input.purchaseQuantity,
      purchasePriceMinor: input.purchasePriceMinor,
      usableYieldPct: input.usableYieldPct,
      updatedAt: now,
    };

    if (input.id) {
      ingredientId = input.id;
      const [previous] = await transaction
        .select()
        .from(ingredients)
        .where(eq(ingredients.id, ingredientId))
        .limit(1);

      if (!previous) {
        throw new Error('Ingredient no longer exists.');
      }
      const previousConversions = await transaction
        .select()
        .from(unitConversions)
        .where(eq(unitConversions.ingredientId, ingredientId));
      const previousPurchaseConversion = previousConversions.find(
        (conversion) => conversion.fromUnit === previous.purchaseUnit,
      );
      const currentPurchaseConversion = input.conversions.find(
        (conversion) => conversion.fromUnit === input.purchaseUnit,
      );
      const purchaseConversionChanged =
        previous.purchaseUnit === input.purchaseUnit &&
        JSON.stringify(previousPurchaseConversion ?? null) !==
          JSON.stringify(currentPurchaseConversion ?? null);

      await transaction
        .update(ingredients)
        .set(updatedValues)
        .where(eq(ingredients.id, ingredientId));

      if (
        previous.purchasePriceMinor !== input.purchasePriceMinor ||
        previous.purchaseQuantity !== input.purchaseQuantity ||
        previous.purchaseUnit !== input.purchaseUnit ||
        previous.usableYieldPct !== input.usableYieldPct ||
        purchaseConversionChanged
      ) {
        await transaction.insert(ingredientPriceHistory).values({
          ingredientId,
          ...priceHistoryValues,
        });
      }
    } else {
      const [created] = await transaction
        .insert(ingredients)
        .values({ ...updatedValues, lastUsedAt: null, isFavourite: false })
        .returning({ id: ingredients.id });
      ingredientId = created.id;
      await transaction.insert(ingredientPriceHistory).values({
        ingredientId,
        ...priceHistoryValues,
      });
    }

    await transaction.delete(unitConversions).where(eq(unitConversions.ingredientId, ingredientId));
    if (input.conversions.length > 0) {
      await transaction.insert(unitConversions).values(
        input.conversions.map((conversion) => ({
          ingredientId,
          fromUnit: conversion.fromUnit,
          baseQuantity: conversion.baseQuantity,
          baseUnit: conversion.baseUnit,
        })),
      );
    }

    return ingredientId;
  });
}

export async function setIngredientFavourite(
  database: AppDatabase,
  id: string,
  isFavourite: boolean,
) {
  await database.update(ingredients).set({ isFavourite }).where(eq(ingredients.id, id));
}

export async function markIngredientRecent(database: AppDatabase, id: string) {
  await database
    .update(ingredients)
    .set({ lastUsedAt: new Date().toISOString() })
    .where(eq(ingredients.id, id));
}

