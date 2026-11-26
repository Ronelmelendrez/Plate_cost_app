import { relations, sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

import { BASE_UNITS, CONVERSION_UNITS, PURCHASE_UNITS } from '@core/costing/units';

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

export const ingredientRelations = relations(ingredients, ({ many }) => ({
  conversions: many(unitConversions),
  priceHistory: many(ingredientPriceHistory),
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
};
