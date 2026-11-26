import { Decimal } from 'decimal.js';

import {
  BASE_UNITS,
  CONVERSION_UNITS,
  PURCHASE_UNITS,
  RECIPE_UNITS,
  RECIPE_YIELD_UNITS,
} from '@core/costing/units';
import {
  getAvailableRoundingRules,
  PRICE_ROUNDING_RULES,
} from '@core/costing/suggestedPrice';
import type {
  channels,
  globalSettings,
  ingredientPriceHistory,
  ingredients,
  packagingItems,
  recipeChannelPrices,
  recipeItems,
  recipes,
  unitConversions,
} from '@core/db/schema';

type Ingredient = typeof ingredients.$inferSelect;
type UnitConversion = typeof unitConversions.$inferSelect;
type IngredientPriceHistory = typeof ingredientPriceHistory.$inferSelect;
type Recipe = typeof recipes.$inferSelect;
type RecipeItem = typeof recipeItems.$inferSelect;
type PackagingItem = typeof packagingItems.$inferSelect;
type Channel = typeof channels.$inferSelect;
type RecipeChannelPrice = typeof recipeChannelPrices.$inferSelect;

export interface BackupGlobalSettings {
  id: 1;
  locale: string;
  currency_code: string;
  unit_system: 'metric' | 'us';
  cup_ml: string;
  tablespoon_ml: string;
  prices_include_tax: boolean;
  tax_pct: string;
  waste_pct: string;
  target_margin_pct: string;
  fees_on_tax_included_price: boolean;
  rounding_rule: (typeof globalSettings.$inferSelect)['roundingRule'];
  is_initialized: boolean;
}

export interface BackupV1 {
  format: 'platecost-backup';
  schema_version: 1;
  exported_at: string;
  tables: {
    ingredients: Ingredient[];
    unit_conversions: UnitConversion[];
    ingredient_price_history: IngredientPriceHistory[];
    recipes: Recipe[];
    recipe_items: RecipeItem[];
    packaging_items: PackagingItem[];
    global_settings: BackupGlobalSettings;
    channels: Channel[];
    recipe_channel_prices: RecipeChannelPrice[];
  };
}

export class BackupValidationError extends Error {
  constructor() {
    super('The selected file is not a valid PlateCost backup.');
    this.name = 'BackupValidationError';
  }
}

const MAX_BACKUP_CHARACTERS = 20_000_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function fail(): never {
  throw new BackupValidationError();
}

function stringValue(value: unknown, allowEmpty = false) {
  if (typeof value !== 'string' || (!allowEmpty && value.trim().length === 0)) {
    fail();
  }
  return value;
}

function nullableStringValue(value: unknown) {
  return value === null ? null : stringValue(value, true);
}

function integerValue(value: unknown, minimum = 0) {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < minimum) {
    fail();
  }
  return value;
}

function booleanValue(value: unknown) {
  if (typeof value !== 'boolean') {
    fail();
  }
  return value;
}

function decimalStringValue(
  value: unknown,
  minimum: string | number = 0,
  maximum?: string | number,
  strictlyGreaterThanMinimum = false,
) {
  const text = stringValue(value);
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(text)) {
    fail();
  }
  let decimal: Decimal;
  try {
    decimal = new Decimal(text);
  } catch {
    fail();
  }
  const minimumDecimal = new Decimal(minimum);
  if (
    !decimal.isFinite() ||
    (strictlyGreaterThanMinimum ? decimal.lte(minimumDecimal) : decimal.lt(minimumDecimal)) ||
    (maximum !== undefined && decimal.gt(maximum))
  ) {
    fail();
  }
  return text;
}

function positiveDecimalStringValue(value: unknown) {
  return decimalStringValue(value, 0, undefined, true);
}

function enumValue<const T extends readonly string[]>(value: unknown, choices: T): T[number] {
  const choice = choices.find((candidate) => candidate === value);
  if (!choice) {
    fail();
  }
  return choice;
}

function timestampValue(value: unknown) {
  const timestamp = stringValue(value);
  if (!Number.isFinite(Date.parse(timestamp))) {
    fail();
  }
  return timestamp;
}

function recordValue(value: unknown) {
  if (!isRecord(value)) {
    fail();
  }
  return value;
}

function arrayValue(value: unknown) {
  if (!Array.isArray(value)) {
    fail();
  }
  return value;
}

function assertUniqueIds<T extends { id: string }>(rows: T[]) {
  if (new Set(rows.map((row) => row.id)).size !== rows.length) {
    fail();
  }
  return rows;
}

function parseIngredients(value: unknown): Ingredient[] {
  return assertUniqueIds(
    arrayValue(value).map((entry): Ingredient => {
      const row = recordValue(entry);
      return {
        id: stringValue(row.id),
        name: stringValue(row.name),
        purchaseUnit: enumValue(row.purchaseUnit, PURCHASE_UNITS),
        purchaseQuantity: positiveDecimalStringValue(row.purchaseQuantity),
        purchasePriceMinor: integerValue(row.purchasePriceMinor),
        usableYieldPct: decimalStringValue(row.usableYieldPct, 0, 100, true),
        isFavourite: booleanValue(row.isFavourite),
        lastUsedAt: nullableStringValue(row.lastUsedAt),
        updatedAt: timestampValue(row.updatedAt),
      };
    }),
  );
}

function parseUnitConversions(value: unknown): UnitConversion[] {
  const rows = assertUniqueIds(
    arrayValue(value).map((entry): UnitConversion => {
      const row = recordValue(entry);
      return {
        id: stringValue(row.id),
        ingredientId: stringValue(row.ingredientId),
        fromUnit: enumValue(row.fromUnit, CONVERSION_UNITS),
        baseQuantity: positiveDecimalStringValue(row.baseQuantity),
        baseUnit: enumValue(row.baseUnit, BASE_UNITS),
      };
    }),
  );
  const uniquePairs = new Set(rows.map((row) => `${row.ingredientId}\u0000${row.fromUnit}`));
  if (uniquePairs.size !== rows.length) {
    fail();
  }
  return rows;
}

function parseIngredientPriceHistory(value: unknown): IngredientPriceHistory[] {
  return assertUniqueIds(
    arrayValue(value).map((entry): IngredientPriceHistory => {
      const row = recordValue(entry);
      return {
        id: stringValue(row.id),
        ingredientId: stringValue(row.ingredientId),
        priceMinor: integerValue(row.priceMinor),
        purchaseQuantity: positiveDecimalStringValue(row.purchaseQuantity),
        purchaseUnit: enumValue(row.purchaseUnit, PURCHASE_UNITS),
        recordedAt: timestampValue(row.recordedAt),
      };
    }),
  );
}

function parseRecipes(value: unknown): Recipe[] {
  return assertUniqueIds(
    arrayValue(value).map((entry): Recipe => {
      const row = recordValue(entry);
      return {
        id: stringValue(row.id),
        name: stringValue(row.name),
        portions: integerValue(row.portions, 1),
        batchYieldQuantity: positiveDecimalStringValue(row.batchYieldQuantity),
        batchYieldUnit: enumValue(row.batchYieldUnit, RECIPE_YIELD_UNITS),
        isSubRecipe: booleanValue(row.isSubRecipe),
        sellingPriceMinor:
          row.sellingPriceMinor === null ? null : integerValue(row.sellingPriceMinor),
        notes: nullableStringValue(row.notes),
        laborMinutes: decimalStringValue(row.laborMinutes),
        laborRateMinor: integerValue(row.laborRateMinor),
        overheadMode: enumValue(row.overheadMode, ['none', 'flat', 'percent']),
        overheadValue: decimalStringValue(row.overheadValue),
        updatedAt: timestampValue(row.updatedAt),
      };
    }),
  );
}

function parseRecipeItems(value: unknown): RecipeItem[] {
  return assertUniqueIds(
    arrayValue(value).map((entry): RecipeItem => {
      const row = recordValue(entry);
      return {
        id: stringValue(row.id),
        recipeId: stringValue(row.recipeId),
        kind: enumValue(row.kind, ['ingredient', 'recipe', 'packaging']),
        referenceId: stringValue(row.referenceId),
        quantity: positiveDecimalStringValue(row.quantity),
        unit: enumValue(row.unit, RECIPE_UNITS),
      };
    }),
  );
}

function parsePackagingItems(value: unknown): PackagingItem[] {
  return assertUniqueIds(
    arrayValue(value).map((entry): PackagingItem => {
      const row = recordValue(entry);
      return {
        id: stringValue(row.id),
        name: stringValue(row.name),
        costMinor: integerValue(row.costMinor),
        updatedAt: timestampValue(row.updatedAt),
      };
    }),
  );
}

function parseGlobalSettings(value: unknown): BackupGlobalSettings {
  const row = recordValue(value);
  if (integerValue(row.id, 1) !== 1) {
    fail();
  }
  const currencyCode = stringValue(row.currency_code);
  const locale = stringValue(row.locale);
  if (!/^[A-Z]{3}$/.test(currencyCode)) {
    fail();
  }
  try {
    new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currencyCode,
    });
  } catch {
    fail();
  }
  const fractionDigits = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currencyCode,
  }).resolvedOptions().maximumFractionDigits ?? 2;
  const roundingRule = enumValue(row.rounding_rule, [...PRICE_ROUNDING_RULES, 'auto']);
  if (
    roundingRule !== 'auto' &&
    !getAvailableRoundingRules(fractionDigits).includes(roundingRule)
  ) {
    fail();
  }
  return {
    id: 1,
    locale,
    currency_code: currencyCode,
    unit_system: enumValue(row.unit_system, ['metric', 'us']),
    cup_ml: decimalStringValue(row.cup_ml, 0, 2000, true),
    tablespoon_ml: decimalStringValue(row.tablespoon_ml, 0, 100, true),
    prices_include_tax: booleanValue(row.prices_include_tax),
    tax_pct: decimalStringValue(row.tax_pct, 0, 100),
    waste_pct: decimalStringValue(row.waste_pct, 0, 100),
    target_margin_pct: decimalStringValue(row.target_margin_pct, 0, 100),
    fees_on_tax_included_price: booleanValue(row.fees_on_tax_included_price),
    rounding_rule: roundingRule,
    is_initialized: booleanValue(row.is_initialized),
  };
}

function parseChannels(value: unknown): Channel[] {
  return assertUniqueIds(
    arrayValue(value).map((entry): Channel => {
      const row = recordValue(entry);
      return {
        id: stringValue(row.id),
        name: stringValue(row.name),
        commissionPct: decimalStringValue(row.commissionPct, 0, 100),
        paymentFeePct: decimalStringValue(row.paymentFeePct, 0, 100),
        isDefault: booleanValue(row.isDefault),
      };
    }),
  );
}

function parseRecipeChannelPrices(value: unknown): RecipeChannelPrice[] {
  const rows = assertUniqueIds(
    arrayValue(value).map((entry): RecipeChannelPrice => {
      const row = recordValue(entry);
      return {
        id: stringValue(row.id),
        recipeId: stringValue(row.recipeId),
        channelId: stringValue(row.channelId),
        priceMinor: integerValue(row.priceMinor, 1),
      };
    }),
  );
  const uniquePairs = new Set(rows.map((row) => `${row.recipeId}\u0000${row.channelId}`));
  if (uniquePairs.size !== rows.length) {
    fail();
  }
  return rows;
}

function validateReferences(tables: BackupV1['tables']) {
  const ingredientIds = new Set(tables.ingredients.map((row) => row.id));
  const packagingIds = new Set(tables.packaging_items.map((row) => row.id));
  const recipeById = new Map(tables.recipes.map((row) => [row.id, row]));
  const channelIds = new Set(tables.channels.map((row) => row.id));

  if (
    tables.unit_conversions.some((row) => !ingredientIds.has(row.ingredientId)) ||
    tables.ingredient_price_history.some((row) => !ingredientIds.has(row.ingredientId))
  ) {
    fail();
  }

  const recipeEdges = new Map<string, string[]>();
  for (const item of tables.recipe_items) {
    if (!recipeById.has(item.recipeId)) {
      fail();
    }
    if (item.kind === 'ingredient' && !ingredientIds.has(item.referenceId)) {
      fail();
    }
    if (item.kind === 'packaging' && !packagingIds.has(item.referenceId)) {
      fail();
    }
    if (item.kind === 'recipe') {
      const child = recipeById.get(item.referenceId);
      if (!child?.isSubRecipe) {
        fail();
      }
      const children = recipeEdges.get(item.recipeId) ?? [];
      children.push(item.referenceId);
      recipeEdges.set(item.recipeId, children);
    }
  }

  for (const price of tables.recipe_channel_prices) {
    const recipe = recipeById.get(price.recipeId);
    if (!recipe || recipe.isSubRecipe || !channelIds.has(price.channelId)) {
      fail();
    }
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const hasCycle = (id: string): boolean => {
    if (visiting.has(id)) {
      return true;
    }
    if (visited.has(id)) {
      return false;
    }
    visiting.add(id);
    for (const childId of recipeEdges.get(id) ?? []) {
      if (hasCycle(childId)) {
        return true;
      }
    }
    visiting.delete(id);
    visited.add(id);
    return false;
  };
  if (tables.recipes.some((recipe) => hasCycle(recipe.id))) {
    fail();
  }
}

export function validateBackup(value: unknown): BackupV1 {
  const backup = recordValue(value);
  if (
    backup.format !== 'platecost-backup' ||
    backup.schema_version !== 1 ||
    typeof backup.exported_at !== 'string' ||
    !Number.isFinite(Date.parse(backup.exported_at))
  ) {
    fail();
  }
  const tables = recordValue(backup.tables);
  const validated: BackupV1 = {
    format: 'platecost-backup',
    schema_version: 1,
    exported_at: backup.exported_at,
    tables: {
      ingredients: parseIngredients(tables.ingredients),
      unit_conversions: parseUnitConversions(tables.unit_conversions),
      ingredient_price_history: parseIngredientPriceHistory(tables.ingredient_price_history),
      recipes: parseRecipes(tables.recipes),
      recipe_items: parseRecipeItems(tables.recipe_items),
      packaging_items: parsePackagingItems(tables.packaging_items),
      global_settings: parseGlobalSettings(tables.global_settings),
      channels: parseChannels(tables.channels),
      recipe_channel_prices: parseRecipeChannelPrices(tables.recipe_channel_prices),
    },
  };
  validateReferences(validated.tables);
  return validated;
}

export function parseBackup(text: string): BackupV1 {
  if (text.length > MAX_BACKUP_CHARACTERS) {
    fail();
  }
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    fail();
  }
  return validateBackup(value);
}
