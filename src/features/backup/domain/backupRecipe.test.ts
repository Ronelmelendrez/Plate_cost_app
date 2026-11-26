import { describe, expect, it } from 'vitest';

import type { recipes } from '@core/db/schema';

import { omitLocalRecipeImages } from './backupRecipe';

describe('omitLocalRecipeImages', () => {
  it('keeps recipe data but excludes the device-local photo URI', () => {
    const recipe: typeof recipes.$inferSelect = {
      id: 'recipe-1',
      name: 'Roasted vegetables',
      portions: 2,
      batchYieldQuantity: '2',
      batchYieldUnit: 'portion',
      isSubRecipe: false,
      sellingPriceMinor: 1250,
      notes: null,
      laborMinutes: '0',
      laborRateMinor: 0,
      overheadMode: 'none',
      overheadValue: '0',
      imageUri: 'file:///private/recipe-images/recipe-1.jpg',
      updatedAt: '2026-05-01T10:00:00.000Z',
    };

    const [backupRecipe] = omitLocalRecipeImages([recipe]);

    expect(backupRecipe).toEqual({
      id: 'recipe-1',
      name: 'Roasted vegetables',
      portions: 2,
      batchYieldQuantity: '2',
      batchYieldUnit: 'portion',
      isSubRecipe: false,
      sellingPriceMinor: 1250,
      notes: null,
      laborMinutes: '0',
      laborRateMinor: 0,
      overheadMode: 'none',
      overheadValue: '0',
      updatedAt: '2026-05-01T10:00:00.000Z',
    });
    expect(backupRecipe).not.toHaveProperty('imageUri');
  });
});
