import { asc, desc, eq } from 'drizzle-orm';

import type { AppDatabase } from '@core/db/client';
import { ingredientPriceHistory, ingredients, unitConversions } from '@core/db/schema';
import type { BaseUnit, ConversionUnit, PurchaseUnit } from '@core/costing/units';

export type Ingredient = typeof ingredients.$inferSelect;
export type IngredientConversion = typeof unitConversions.$inferSelect;
export type IngredientPriceRecord = typeof ingredientPriceHistory.$inferSelect;

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
  return search
    ? found.filter((ingredient) => ingredient.name.toLocaleLowerCase().includes(search))
    : found;
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

      await transaction
        .update(ingredients)
        .set(updatedValues)
        .where(eq(ingredients.id, ingredientId));

      if (
        previous.purchasePriceMinor !== input.purchasePriceMinor ||
        previous.purchaseQuantity !== input.purchaseQuantity ||
        previous.purchaseUnit !== input.purchaseUnit
      ) {
        await transaction.insert(ingredientPriceHistory).values({
          ingredientId,
          priceMinor: input.purchasePriceMinor,
          purchaseQuantity: input.purchaseQuantity,
          purchaseUnit: input.purchaseUnit,
          recordedAt: now,
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
        priceMinor: input.purchasePriceMinor,
        purchaseQuantity: input.purchaseQuantity,
        purchaseUnit: input.purchaseUnit,
        recordedAt: now,
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

