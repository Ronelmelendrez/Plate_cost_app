import type { packagingItems } from '@core/db/schema';

export type PackagingItem = typeof packagingItems.$inferSelect;

export interface RecipePackagingDraft {
  id: string;
  packagingId: string;
  quantityPerPortion: string;
  appliesTo: 'all' | 'selected';
  channelIds: string[];
}

export interface PackagingInput {
  id?: string;
  name: string;
  packPriceMinor: number;
  piecesPerPack: number;
  note: string | null;
}
