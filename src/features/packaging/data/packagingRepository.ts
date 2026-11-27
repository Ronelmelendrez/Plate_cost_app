import { Decimal } from 'decimal.js';
import { asc, desc, eq } from 'drizzle-orm';

import type { AppDatabase } from '@core/db/client';
import { packagingItems } from '@core/db/schema';

import type { PackagingInput } from '../types';

export type { PackagingItem } from '../types';

export async function listPackagingItems(database: AppDatabase, searchTerm: string) {
  const found = await database
    .select()
    .from(packagingItems)
    .orderBy(
      desc(packagingItems.isFavourite),
      desc(packagingItems.lastUsedAt),
      asc(packagingItems.name),
    );
  const search = searchTerm.trim().toLocaleLowerCase();
  return search
    ? found.filter((item) => item.name.toLocaleLowerCase().includes(search))
    : found;
}

export async function getPackagingItem(database: AppDatabase, id: string) {
  const [item] = await database
    .select()
    .from(packagingItems)
    .where(eq(packagingItems.id, id))
    .limit(1);
  return item;
}

export async function savePackagingItem(database: AppDatabase, input: PackagingInput) {
  if (!input.name.trim()) {
    throw new Error('Packaging name is required.');
  }
  if (!Number.isSafeInteger(input.packPriceMinor) || input.packPriceMinor <= 0) {
    throw new Error('Pack price must be a positive minor-unit amount.');
  }
  if (!Number.isSafeInteger(input.piecesPerPack) || input.piecesPerPack <= 0) {
    throw new Error('Pieces per pack must be a positive whole number.');
  }

  const now = new Date().toISOString();
  if (input.id) {
    const [existing] = await database
      .select()
      .from(packagingItems)
      .where(eq(packagingItems.id, input.id))
      .limit(1);
    if (!existing) {
      throw new Error('Packaging item no longer exists.');
    }
    await database
      .update(packagingItems)
      .set({
        name: input.name.trim(),
        packPriceMinor: input.packPriceMinor,
        piecesPerPack: input.piecesPerPack,
        note: input.note?.trim() || null,
        updatedAt: now,
      })
      .where(eq(packagingItems.id, input.id));
    const previousCostPerPiece = new Decimal(existing.packPriceMinor).div(
      existing.piecesPerPack,
    );
    const nextCostPerPiece = new Decimal(input.packPriceMinor).div(input.piecesPerPack);
    return { id: input.id, priceChanged: !previousCostPerPiece.eq(nextCostPerPiece) };
  }

  const [created] = await database
    .insert(packagingItems)
    .values({
      name: input.name.trim(),
      packPriceMinor: input.packPriceMinor,
      piecesPerPack: input.piecesPerPack,
      note: input.note?.trim() || null,
      updatedAt: now,
    })
    .returning({ id: packagingItems.id });
  return { id: created.id, priceChanged: false };
}

export async function setPackagingFavourite(
  database: AppDatabase,
  id: string,
  isFavourite: boolean,
) {
  await database.update(packagingItems).set({ isFavourite }).where(eq(packagingItems.id, id));
}

export async function markPackagingRecent(database: AppDatabase, id: string) {
  await database
    .update(packagingItems)
    .set({ lastUsedAt: new Date().toISOString() })
    .where(eq(packagingItems.id, id));
}
