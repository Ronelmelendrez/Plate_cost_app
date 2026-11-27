import { relations, sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

import {
  BASE_UNITS,
  CONVERSION_UNITS,
  PURCHASE_UNITS,
  RECIPE_UNITS,
  RECIPE_YIELD_UNITS,
} from '@core/costing/units';
import { PRICE_ROUNDING_RULES } from '@core/costing/suggestedPrice';

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
    imageUri: text('image_uri'),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [index('recipes_name_idx').on(table.name)],
);

export const packagingItems = sqliteTable(
  'packaging_items',
  {
    id: text('id').primaryKey().notNull().default(uuidDefault),
    name: text('name').notNull(),
    packPriceMinor: integer('pack_price_minor').notNull(),
    piecesPerPack: integer('pieces_per_pack').notNull(),
    note: text('note'),
    isFavourite: integer('is_favourite', { mode: 'boolean' }).notNull().default(false),
    lastUsedAt: text('last_used_at'),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [index('packaging_items_name_idx').on(table.name)],
);

export const recipePackaging = sqliteTable(
  'recipe_packaging',
  {
    id: text('id').primaryKey().notNull().default(uuidDefault),
    recipeId: text('recipe_id')
      .notNull()
      .references(() => recipes.id, { onDelete: 'cascade' }),
    packagingId: text('packaging_id')
      .notNull()
      .references(() => packagingItems.id, { onDelete: 'cascade' }),
    qtyPerPortion: text('qty_per_portion').notNull(),
    appliesTo: text('applies_to', { enum: ['all', 'selected'] }).notNull().default('all'),
  },
  (table) => [
    index('recipe_packaging_recipe_idx').on(table.recipeId),
    index('recipe_packaging_packaging_idx').on(table.packagingId),
  ],
);

export const recipeItems = sqliteTable(
  'recipe_items',
  {
    id: text('id').primaryKey().notNull().default(uuidDefault),
    recipeId: text('recipe_id')
      .notNull()
      .references(() => recipes.id, { onDelete: 'cascade' }),
    kind: text('kind', { enum: ['ingredient', 'recipe'] }).notNull(),
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
  locale: text('locale').notNull().default('en-US'),
  currencyCode: text('currency_code').notNull().default('USD'),
  unitSystem: text('unit_system', { enum: ['metric', 'us'] }).notNull().default('metric'),
  cupMl: text('cup_ml').notNull().default('240'),
  tablespoonMl: text('tablespoon_ml').notNull().default('15'),
  pricesIncludeTax: integer('prices_include_tax', { mode: 'boolean' }).notNull().default(false),
  taxPct: text('tax_pct').notNull().default('0'),
  wastePct: text('waste_pct').notNull().default('5'),
  targetMarginPct: text('target_margin_pct').notNull().default('65'),
  feesOnTaxIncludedPrice: integer('fees_on_tax_included_price', { mode: 'boolean' })
    .notNull()
    .default(false),
  roundingRule: text('rounding_rule', { enum: [...PRICE_ROUNDING_RULES, 'auto'] })
    .notNull()
    .default('auto'),
  isInitialized: integer('is_initialized', { mode: 'boolean' }).notNull().default(false),
  onboardingCompleted: integer('onboarding_completed', { mode: 'boolean' })
    .notNull()
    .default(false),
  lastBackupAt: text('last_backup_at'),
  backupReminderSnoozedUntil: text('backup_reminder_snoozed_until'),
});

export const channels = sqliteTable(
  'channels',
  {
    id: text('id').primaryKey().notNull().default(uuidDefault),
    name: text('name').notNull(),
    commissionPct: text('commission_pct').notNull().default('0'),
    paymentFeePct: text('payment_fee_pct').notNull().default('0'),
    isDefault: integer('is_default', { mode: 'boolean' }).notNull().default(false),
  },
  (table) => [index('channels_name_idx').on(table.name)],
);

export const recipePackagingChannels = sqliteTable(
  'recipe_packaging_channels',
  {
    recipePackagingId: text('recipe_packaging_id')
      .notNull()
      .references(() => recipePackaging.id, { onDelete: 'cascade' }),
    channelId: text('channel_id')
      .notNull()
      .references(() => channels.id, { onDelete: 'cascade' }),
  },
  (table) => [
    uniqueIndex('recipe_packaging_channel_unique_idx').on(
      table.recipePackagingId,
      table.channelId,
    ),
    index('recipe_packaging_channel_channel_idx').on(table.channelId),
  ],
);

export const recipeChannelPrices = sqliteTable(
  'recipe_channel_prices',
  {
    id: text('id').primaryKey().notNull().default(uuidDefault),
    recipeId: text('recipe_id')
      .notNull()
      .references(() => recipes.id, { onDelete: 'cascade' }),
    channelId: text('channel_id')
      .notNull()
      .references(() => channels.id, { onDelete: 'cascade' }),
    priceMinor: integer('price_minor').notNull(),
  },
  (table) => [
    uniqueIndex('recipe_channel_price_unique_idx').on(table.recipeId, table.channelId),
    index('recipe_channel_price_channel_idx').on(table.channelId),
  ],
);

export const ingredientRelations = relations(ingredients, ({ many }) => ({
  conversions: many(unitConversions),
  priceHistory: many(ingredientPriceHistory),
  recipeItems: many(recipeItems),
}));

export const recipeRelations = relations(recipes, ({ many }) => ({
  items: many(recipeItems),
  packaging: many(recipePackaging),
  channelPrices: many(recipeChannelPrices),
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

export const channelRelations = relations(channels, ({ many }) => ({
  recipePrices: many(recipeChannelPrices),
  recipePackaging: many(recipePackagingChannels),
}));

export const recipePackagingRelations = relations(recipePackaging, ({ many, one }) => ({
  channels: many(recipePackagingChannels),
  packaging: one(packagingItems, {
    fields: [recipePackaging.packagingId],
    references: [packagingItems.id],
  }),
  recipe: one(recipes, {
    fields: [recipePackaging.recipeId],
    references: [recipes.id],
  }),
}));

export const recipePackagingChannelRelations = relations(
  recipePackagingChannels,
  ({ one }) => ({
    channel: one(channels, {
      fields: [recipePackagingChannels.channelId],
      references: [channels.id],
    }),
    recipePackaging: one(recipePackaging, {
      fields: [recipePackagingChannels.recipePackagingId],
      references: [recipePackaging.id],
    }),
  }),
);

export const recipeChannelPriceRelations = relations(recipeChannelPrices, ({ one }) => ({
  recipe: one(recipes, {
    fields: [recipeChannelPrices.recipeId],
    references: [recipes.id],
  }),
  channel: one(channels, {
    fields: [recipeChannelPrices.channelId],
    references: [channels.id],
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
  recipePackaging,
  recipePackagingRelations,
  recipePackagingChannels,
  recipePackagingChannelRelations,
  globalSettings,
  channels,
  channelRelations,
  recipeChannelPrices,
  recipeChannelPriceRelations,
};
