import { describe, expect, it } from 'vitest';

import { parseBackup } from './backupFormat';

function legacyBackup() {
  const timestamp = '2026-05-01T10:00:00.000Z';
  return {
    format: 'platecost-backup',
    schema_version: 1,
    exported_at: timestamp,
    tables: {
      ingredients: [],
      unit_conversions: [],
      ingredient_price_history: [],
      recipes: [
        {
          id: 'dish',
          name: 'Dish',
          portions: 2,
          batchYieldQuantity: '2',
          batchYieldUnit: 'portion',
          isSubRecipe: false,
          sellingPriceMinor: null,
          notes: null,
          laborMinutes: '0',
          laborRateMinor: 0,
          overheadMode: 'none',
          overheadValue: '0',
          updatedAt: timestamp,
        },
        {
          id: 'sauce',
          name: 'Sauce',
          portions: 1,
          batchYieldQuantity: '8',
          batchYieldUnit: 'portion',
          isSubRecipe: true,
          sellingPriceMinor: null,
          notes: null,
          laborMinutes: '0',
          laborRateMinor: 0,
          overheadMode: 'none',
          overheadValue: '0',
          updatedAt: timestamp,
        },
      ],
      recipe_items: [
        {
          id: 'dish-package',
          recipeId: 'dish',
          kind: 'packaging',
          referenceId: 'tray',
          quantity: '1',
          unit: 'piece',
        },
        {
          id: 'dish-sauce',
          recipeId: 'dish',
          kind: 'recipe',
          referenceId: 'sauce',
          quantity: '4',
          unit: 'portion',
        },
        {
          id: 'sauce-package',
          recipeId: 'sauce',
          kind: 'packaging',
          referenceId: 'box',
          quantity: '2',
          unit: 'piece',
        },
      ],
      packaging_items: [
        { id: 'tray', name: 'Tray', costMinor: 450, updatedAt: timestamp },
        { id: 'box', name: 'Box', costMinor: 100, updatedAt: timestamp },
      ],
      global_settings: {
        id: 1,
        locale: 'en-US',
        currency_code: 'USD',
        unit_system: 'metric',
        cup_ml: '240',
        tablespoon_ml: '15',
        prices_include_tax: false,
        tax_pct: '0',
        waste_pct: '0',
        target_margin_pct: '65',
        fees_on_tax_included_price: false,
        rounding_rule: 'auto',
        is_initialized: true,
      },
      channels: [],
      recipe_channel_prices: [],
    },
  };
}

describe('parseBackup', () => {
  it('converts v1 packaging data and expands sub-recipe packaging per dish portion', () => {
    const backup = parseBackup(JSON.stringify(legacyBackup()));
    const restoredBackup = parseBackup(JSON.stringify(backup));

    expect(backup.schema_version).toBe(2);
    expect(restoredBackup).toEqual(backup);
    expect(backup.tables.recipe_items.map(({ id }) => id)).toEqual(['dish-sauce']);
    expect(backup.tables.packaging_items).toEqual([
      {
        id: 'tray',
        name: 'Tray',
        packPriceMinor: 450,
        piecesPerPack: 1,
        note: null,
        isFavourite: false,
        lastUsedAt: null,
        updatedAt: '2026-05-01T10:00:00.000Z',
      },
      {
        id: 'box',
        name: 'Box',
        packPriceMinor: 100,
        piecesPerPack: 1,
        note: null,
        isFavourite: false,
        lastUsedAt: null,
        updatedAt: '2026-05-01T10:00:00.000Z',
      },
    ]);
    expect(backup.tables.recipe_packaging).toEqual([
      {
        id: 'dish-package',
        recipeId: 'dish',
        packagingId: 'tray',
        qtyPerPortion: '1',
        appliesTo: 'all',
      },
      {
        id: 'legacy-expanded-dish-1',
        recipeId: 'dish',
        packagingId: 'box',
        qtyPerPortion: '0.5',
        appliesTo: 'all',
      },
      {
        id: 'sauce-package',
        recipeId: 'sauce',
        packagingId: 'box',
        qtyPerPortion: '2',
        appliesTo: 'all',
      },
    ]);
  });
});
