import { describe, expect, it } from 'vitest';

import { DEFAULT_RECIPE_UNIT_SIZES } from '@core/costing/units';

import { expandLegacyPackaging } from './packagingMigration';

describe('packaging schema migration', () => {
  it('expands sub-recipe packaging per dish portion and preserves legacy source rows', () => {
    const result = expandLegacyPackaging(
      [
        {
          id: 'dish',
          portions: 2,
          batch_yield_quantity: '2',
          batch_yield_unit: 'portion',
          is_sub_recipe: 0,
        },
        {
          id: 'sauce',
          portions: 1,
          batch_yield_quantity: '8',
          batch_yield_unit: 'portion',
          is_sub_recipe: 1,
        },
      ],
      [
        {
          id: 'dish-package',
          recipe_id: 'dish',
          kind: 'packaging',
          reference_id: 'tray',
          quantity: '1',
          unit: 'piece',
        },
        {
          id: 'dish-sauce',
          recipe_id: 'dish',
          kind: 'recipe',
          reference_id: 'sauce',
          quantity: '4',
          unit: 'portion',
        },
        {
          id: 'sauce-package',
          recipe_id: 'sauce',
          kind: 'packaging',
          reference_id: 'box',
          quantity: '2',
          unit: 'piece',
        },
      ],
      '0',
      DEFAULT_RECIPE_UNIT_SIZES,
    );

    expect(result.dishLines).toEqual([
      {
        id: 'dish-package',
        recipeId: 'dish',
        packagingId: 'tray',
        quantity: '1',
      },
      {
        recipeId: 'dish',
        packagingId: 'box',
        quantity: '0.5',
      },
    ]);
    expect(result.legacySubRecipeLines).toEqual([
      {
        id: 'sauce-package',
        recipeId: 'sauce',
        packagingId: 'box',
        quantity: '2',
      },
    ]);
  });
});
