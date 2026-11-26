import { relations, sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

import {
  BASE_UNITS,
  CONVERSION_UNITS,
  PURCHASE_UNITS,
  RECIPE_UNITS,
  RECIPE_YIELD_UNITS,
} from '@core/costing/units';

const uuidDefault = sql`(lower(hex(randomblob(16))))`;

export const ingredients = sqliteTable(
  'ingredients',
  {
    id: text('id').primaryKey().notNull().default(uuidDefault),
    name: text('name').notNull(),
    purchaseUnit: text('purchase_unit', { enum: PURCHASE_UNITS }).notNull(),
    purchaseQuantity: text('purchase_quantity').notNull(),
    purchasePriceMinor: integer('purchase_price_minor').notNull(),
    usableYieldPct: text('usable_yield_pct').notNull().default('100'),
    isFavourite: integer('is_favourite', { mode: 'boolean' }).notNull().default(false),
    lastUsedAt: text('last_used_at'),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [index('ingredients_name_idx').on(table.name)],
);

export const unitConversions = sqliteTable(
  'unit_conversions',
  {
    id: text('id').primaryKey().notNull().default(uuidDefault),
    ingredientId: text('ingredient_id')
      .notNull()
      .references(() => ingredients.id, { onDelete: 'cascade' }),
    fromUnit: text('from_unit', { enum: CONVERSION_UNITS }).notNull(),
    baseQuantity: text('base_quantity').notNull(),
    baseUnit: text('base_unit', { enum: BASE_UNITS }).notNull(),
  },
  (table) => [uniqueIndex('unit_conversions_ingredient_unit_idx').on(table.ingredientId, table.fromUnit)],
);

export const ingredientPriceHistory = sqliteTable(
  'ingredient_price_history',
  {
    id: text('id').primaryKey().notNull().default(uuidDefault),
    ingredientId: text('ingredient_id')
      .notNull()
      .references(() => ingredients.id, { onDelete: 'cascade' }),
    priceMinor: integer('price_minor').notNull(),
    purchaseQuantity: text('purchase_quantity').notNull(),
    purchaseUnit: text('purchase_unit').notNull(),
    recordedAt: text('recorded_at').notNull(),
  },
  (table) => [index('ingredient_price_history_ingredient_idx').on(table.ingredientId, table.recordedAt)],
);

export const recipes = sqliteTable(
  'recipes',
  {
    id: text('id').primaryKey().notNull().default(uuidDefault),
    name: text('name').notNull(),
    portions: integer('portions').notNull().default(1),
    batchYieldQuantity: text('batch_yield_quantity').notNull().default('1'),
    batchYieldUnit: text('batch_yield_unit', { enum: [...RECIPE_YIELD_UNITS] })
      .notNull()
      .default('portion'),
    isSubRecipe: integer('is_sub_recipe', { mode: 'boolean' }).notNull().default(false),
    sellingPriceMinor: integer('selling_price_minor'),
    notes: text('notes'),
    laborMinutes: text('labor_minutes').notNull().default('0'),
    laborRateMinor: integer('labor_rate_minor').notNull().default(0),
    overheadMode: text('overhead_mode', { enum: ['none', 'flat', 'percent'] })
      .notNull()
      .default('none'),
    overheadValue: text('overhead_value').notNull().default('0'),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [index('recipes_name_idx').on(table.name)],
);

export const packagingItems = sqliteTable(
  'packaging_items',
  {
    id: text('id').primaryKey().notNull().default(uuidDefault),
    name: text('name').notNull(),
    costMinor: integer('cost_minor').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [index('packaging_items_name_idx').on(table.name)],
);

export const recipeItems = sqliteTable(
  'recipe_items',
  {
    id: text('id').primaryKey().notNull().default(uuidDefault),
    recipeId: text('recipe_id')
      .notNull()
      .references(() => recipes.id, { onDelete: 'cascade' }),
    kind: text('kind', { enum: ['ingredient', 'recipe', 'packaging'] }).notNull(),
    referenceId: text('reference_id').notNull(),
    quantity: text('quantity').notNull(),
    unit: text('unit', { enum: [...RECIPE_UNITS] }).notNull(),
  },
  (table) => [
    index('recipe_items_recipe_idx').on(table.recipeId),
    index('recipe_items_reference_idx').on(table.kind, table.referenceId),
  ],
);

export const globalSettings = sqliteTable('global_settings', {
  id: integer('id').primaryKey().notNull().default(1),
  wastePct: text('waste_pct').notNull().default('5'),
});

export const ingredientRelations = relations(ingredients, ({ many }) => ({
  conversions: many(unitConversions),
  priceHistory: many(ingredientPriceHistory),
  recipeItems: many(recipeItems),
}));

export const recipeRelations = relations(recipes, ({ many }) => ({
  items: many(recipeItems),
}));

export const recipeItemRelations = relations(recipeItems, ({ one }) => ({
  recipe: one(recipes, {
    fields: [recipeItems.recipeId],
    references: [recipes.id],
  }),
}));

export const ingredientPriceHistoryRelations = relations(ingredientPriceHistory, ({ one }) => ({
  ingredient: one(ingredients, {
    fields: [ingredientPriceHistory.ingredientId],
    references: [ingredients.id],
  }),
}));

export const unitConversionRelations = relations(unitConversions, ({ one }) => ({
  ingredient: one(ingredients, {
    fields: [unitConversions.ingredientId],
    references: [ingredients.id],
  }),
}));

export const schema = {
  ingredients,
  ingredientRelations,
  unitConversions,
  unitConversionRelations,
  ingredientPriceHistory,
  ingredientPriceHistoryRelations,
  recipes,
  recipeRelations,
  recipeItems,
  recipeItemRelations,
  packagingItems,
  globalSettings,
};
