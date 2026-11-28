import type { SQLiteDatabase } from 'expo-sqlite';

import {
  DEFAULT_RECIPE_UNIT_SIZES,
  PURCHASE_UNITS,
  quantityInBaseUnits,
  type PurchaseUnit,
} from '@core/costing/units';
import {
  expandLegacyPackaging,
  type LegacyRecipeItemRow,
  type LegacyRecipeRow,
} from './packagingMigration';

const DATABASE_VERSION = 9;

export async function migrateDbIfNeeded(db: SQLiteDatabase) {
  const versionRow = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  let currentVersion = versionRow?.user_version ?? 0;

  if (currentVersion >= DATABASE_VERSION) {
    return;
  }

  if (currentVersion === 0) {
    await db.execAsync("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
    await db.withTransactionAsync(async () => {
      await db.execAsync(`
      CREATE TABLE ingredients (
        id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
        name TEXT NOT NULL,
        purchase_unit TEXT NOT NULL,
        purchase_quantity TEXT NOT NULL,
        purchase_price_minor INTEGER NOT NULL,
        usable_yield_pct TEXT NOT NULL DEFAULT '100',
        is_favourite INTEGER NOT NULL DEFAULT 0,
        last_used_at TEXT,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX ingredients_name_idx ON ingredients(name);
      CREATE TABLE unit_conversions (
        id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
        ingredient_id TEXT NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
        from_unit TEXT NOT NULL,
        base_quantity TEXT NOT NULL,
        base_unit TEXT NOT NULL,
        UNIQUE (ingredient_id, from_unit)
      );
      CREATE TABLE ingredient_price_history (
        id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
        ingredient_id TEXT NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
        price_minor INTEGER NOT NULL,
        purchase_quantity TEXT NOT NULL,
        purchase_unit TEXT NOT NULL,
        recorded_at TEXT NOT NULL
      );
      CREATE INDEX ingredient_price_history_ingredient_idx
        ON ingredient_price_history(ingredient_id, recorded_at);
      PRAGMA user_version = 1;
    `);
    });
    currentVersion = 1;
  }

  if (currentVersion < 2) {
    await db.withTransactionAsync(async () => {
      await db.execAsync(`
        CREATE TABLE recipes (
          id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
          name TEXT NOT NULL,
          portions INTEGER NOT NULL DEFAULT 1,
          batch_yield_quantity TEXT NOT NULL DEFAULT '1',
          batch_yield_unit TEXT NOT NULL DEFAULT 'portion'
            CHECK (batch_yield_unit IN ('g', 'ml', 'pc', 'portion')),
          is_sub_recipe INTEGER NOT NULL DEFAULT 0,
          selling_price_minor INTEGER,
          notes TEXT,
          labor_minutes TEXT NOT NULL DEFAULT '0',
          labor_rate_minor INTEGER NOT NULL DEFAULT 0,
          overhead_mode TEXT NOT NULL DEFAULT 'none'
            CHECK (overhead_mode IN ('none', 'flat', 'percent')),
          overhead_value TEXT NOT NULL DEFAULT '0',
          updated_at TEXT NOT NULL
        );
        CREATE INDEX recipes_name_idx ON recipes(name);
        CREATE TABLE packaging_items (
          id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
          name TEXT NOT NULL,
          cost_minor INTEGER NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE INDEX packaging_items_name_idx ON packaging_items(name);
        CREATE TABLE recipe_items (
          id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
          recipe_id TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
          kind TEXT NOT NULL CHECK (kind IN ('ingredient', 'recipe', 'packaging')),
          reference_id TEXT NOT NULL,
          quantity TEXT NOT NULL,
          unit TEXT NOT NULL CHECK (
            unit IN ('kg', 'g', 'lb', 'oz', 'L', 'ml', 'fl oz', 'piece', 'pc', 'cup', 'tbsp', 'tsp', 'portion')
          )
        );
        CREATE INDEX recipe_items_recipe_idx ON recipe_items(recipe_id);
        CREATE INDEX recipe_items_reference_idx ON recipe_items(kind, reference_id);
        CREATE TABLE global_settings (
          id INTEGER PRIMARY KEY NOT NULL DEFAULT 1 CHECK (id = 1),
          waste_pct TEXT NOT NULL DEFAULT '5'
        );
        INSERT INTO global_settings (id, waste_pct) VALUES (1, '5');
        PRAGMA user_version = 2;
      `);
    });
  }

  if (currentVersion < 3) {
    await db.withTransactionAsync(async () => {
      await db.execAsync(`
        ALTER TABLE global_settings ADD COLUMN locale TEXT NOT NULL DEFAULT 'en-US';
        ALTER TABLE global_settings ADD COLUMN currency_code TEXT NOT NULL DEFAULT 'USD';
        ALTER TABLE global_settings ADD COLUMN unit_system TEXT NOT NULL DEFAULT 'metric';
        ALTER TABLE global_settings ADD COLUMN cup_ml TEXT NOT NULL DEFAULT '240';
        ALTER TABLE global_settings ADD COLUMN tablespoon_ml TEXT NOT NULL DEFAULT '15';
        ALTER TABLE global_settings ADD COLUMN prices_include_tax INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE global_settings ADD COLUMN tax_pct TEXT NOT NULL DEFAULT '0';
        ALTER TABLE global_settings ADD COLUMN target_margin_pct TEXT NOT NULL DEFAULT '65';
        ALTER TABLE global_settings ADD COLUMN fees_on_tax_included_price INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE global_settings ADD COLUMN is_initialized INTEGER NOT NULL DEFAULT 0;

        CREATE TABLE channels (
          id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
          name TEXT NOT NULL,
          commission_pct TEXT NOT NULL DEFAULT '0',
          payment_fee_pct TEXT NOT NULL DEFAULT '0',
          is_default INTEGER NOT NULL DEFAULT 0
        );
        CREATE INDEX channels_name_idx ON channels(name);
        INSERT INTO channels (id, name, commission_pct, payment_fee_pct, is_default) VALUES
          ('dine-in', 'Dine-in', '0', '0', 1),
          ('takeaway', 'Takeaway', '0', '0', 1),
          ('delivery-app', 'Delivery app', '0', '0', 1),
          ('online-order', 'Online order', '0', '0', 1);

        CREATE TABLE recipe_channel_prices (
          id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
          recipe_id TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
          channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
          price_minor INTEGER NOT NULL
        );
        CREATE UNIQUE INDEX recipe_channel_price_unique_idx
          ON recipe_channel_prices(recipe_id, channel_id);
        CREATE INDEX recipe_channel_price_channel_idx ON recipe_channel_prices(channel_id);
        INSERT INTO recipe_channel_prices (recipe_id, channel_id, price_minor)
          SELECT id, 'dine-in', selling_price_minor
          FROM recipes
          WHERE selling_price_minor IS NOT NULL;
        PRAGMA user_version = 3;
      `);
    });
  }

  if (currentVersion < 4) {
    await db.withTransactionAsync(async () => {
      await db.execAsync(`
        ALTER TABLE global_settings ADD COLUMN rounding_rule TEXT NOT NULL DEFAULT 'auto';
        PRAGMA user_version = 4;
      `);
    });
    currentVersion = 4;
  }

  if (currentVersion < 5) {
    await db.withTransactionAsync(async () => {
      await db.execAsync(`
        ALTER TABLE global_settings
          ADD COLUMN onboarding_completed INTEGER NOT NULL DEFAULT 0;
        UPDATE global_settings
          SET onboarding_completed = CASE
            WHEN EXISTS (SELECT 1 FROM ingredients)
              OR EXISTS (SELECT 1 FROM recipes)
            THEN 1
            ELSE 0
          END
          WHERE id = 1;
        PRAGMA user_version = 5;
      `);
    });
    currentVersion = 5;
  }

  if (currentVersion < 6) {
    await db.withTransactionAsync(async () => {
      await db.execAsync(`
        ALTER TABLE global_settings ADD COLUMN last_backup_at TEXT;
        ALTER TABLE global_settings ADD COLUMN backup_reminder_snoozed_until TEXT;
        PRAGMA user_version = 6;
      `);
    });
  }

  if (currentVersion < 7) {
    await db.withTransactionAsync(async () => {
      await db.execAsync(`
        ALTER TABLE recipes ADD COLUMN image_uri TEXT;
        PRAGMA user_version = 7;
      `);
    });
  }

  if (currentVersion < 8) {
    await db.withTransactionAsync(async () => {
      const [legacyRecipes, legacyItems, settings] = await Promise.all([
        db.getAllAsync<LegacyRecipeRow>(
          `SELECT id, portions, batch_yield_quantity, batch_yield_unit, is_sub_recipe
           FROM recipes`,
        ),
        db.getAllAsync<LegacyRecipeItemRow>(
          `SELECT id, recipe_id, kind, reference_id, quantity, unit
           FROM recipe_items`,
        ),
        db.getFirstAsync<{ waste_pct: string; cup_ml: string; tablespoon_ml: string }>(
          `SELECT waste_pct, cup_ml, tablespoon_ml FROM global_settings WHERE id = 1`,
        ),
      ]);
      const wastePct = settings?.waste_pct ?? '5';
      const unitSizes = {
        cupMl: settings?.cup_ml ?? DEFAULT_RECIPE_UNIT_SIZES.cupMl,
        tablespoonMl:
          settings?.tablespoon_ml ?? DEFAULT_RECIPE_UNIT_SIZES.tablespoonMl,
      };
      const { dishLines, legacySubRecipeLines } = expandLegacyPackaging(
        legacyRecipes,
        legacyItems,
        wastePct,
        unitSizes,
      );

      await db.execAsync(`
        CREATE TABLE packaging_items_v8 (
          id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
          name TEXT NOT NULL,
          pack_price_minor INTEGER NOT NULL,
          pieces_per_pack INTEGER NOT NULL DEFAULT 1,
          note TEXT,
          is_favourite INTEGER NOT NULL DEFAULT 0,
          last_used_at TEXT,
          updated_at TEXT NOT NULL
        );
        INSERT INTO packaging_items_v8 (
          id, name, pack_price_minor, pieces_per_pack, note, is_favourite, last_used_at, updated_at
        )
        SELECT id, name, cost_minor, 1, NULL, 0, NULL, updated_at FROM packaging_items;
        DROP INDEX packaging_items_name_idx;
        DROP TABLE packaging_items;
        ALTER TABLE packaging_items_v8 RENAME TO packaging_items;
        CREATE INDEX packaging_items_name_idx ON packaging_items(name);

        CREATE TABLE recipe_packaging (
          id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
          recipe_id TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
          packaging_id TEXT NOT NULL REFERENCES packaging_items(id) ON DELETE CASCADE,
          qty_per_portion TEXT NOT NULL,
          applies_to TEXT NOT NULL DEFAULT 'all'
            CHECK (applies_to IN ('all', 'selected'))
        );
        CREATE INDEX recipe_packaging_recipe_idx ON recipe_packaging(recipe_id);
        CREATE INDEX recipe_packaging_packaging_idx ON recipe_packaging(packaging_id);

        CREATE TABLE recipe_packaging_channels (
          recipe_packaging_id TEXT NOT NULL
            REFERENCES recipe_packaging(id) ON DELETE CASCADE,
          channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
          UNIQUE (recipe_packaging_id, channel_id)
        );
        CREATE INDEX recipe_packaging_channel_channel_idx
          ON recipe_packaging_channels(channel_id);

        CREATE TABLE recipe_items_v8 (
          id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
          recipe_id TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
          kind TEXT NOT NULL CHECK (kind IN ('ingredient', 'recipe')),
          reference_id TEXT NOT NULL,
          quantity TEXT NOT NULL,
          unit TEXT NOT NULL CHECK (
            unit IN ('kg', 'g', 'lb', 'oz', 'L', 'ml', 'fl oz', 'piece', 'pc', 'cup', 'tbsp', 'tsp', 'portion')
          )
        );
        INSERT INTO recipe_items_v8 (id, recipe_id, kind, reference_id, quantity, unit)
        SELECT id, recipe_id, kind, reference_id, quantity, unit
        FROM recipe_items
        WHERE kind IN ('ingredient', 'recipe');
        DROP INDEX recipe_items_recipe_idx;
        DROP INDEX recipe_items_reference_idx;
        DROP TABLE recipe_items;
        ALTER TABLE recipe_items_v8 RENAME TO recipe_items;
        CREATE INDEX recipe_items_recipe_idx ON recipe_items(recipe_id);
        CREATE INDEX recipe_items_reference_idx ON recipe_items(kind, reference_id);
        PRAGMA user_version = 8;
      `);

      for (const line of [...dishLines, ...legacySubRecipeLines]) {
        if (line.id) {
          await db.runAsync(
            `INSERT INTO recipe_packaging (id, recipe_id, packaging_id, qty_per_portion, applies_to)
             VALUES (?, ?, ?, ?, 'all')`,
            line.id,
            line.recipeId,
            line.packagingId,
            line.quantity,
          );
        } else {
          await db.runAsync(
            `INSERT INTO recipe_packaging (recipe_id, packaging_id, qty_per_portion, applies_to)
             VALUES (?, ?, ?, 'all')`,
            line.recipeId,
            line.packagingId,
            line.quantity,
          );
        }
      }
    });
    currentVersion = 8;
  }

  if (currentVersion < 9) {
    await db.withTransactionAsync(async () => {
      const historyRows = await db.getAllAsync<{
        id: string;
        ingredient_id: string;
        purchase_quantity: string;
        purchase_unit: string;
      }>(
        `SELECT id, ingredient_id, purchase_quantity, purchase_unit
         FROM ingredient_price_history`,
      );
      const conversions = await db.getAllAsync<{
        ingredient_id: string;
        from_unit: string;
        base_quantity: string;
        base_unit: 'g' | 'ml' | 'pc';
      }>(
        `SELECT ingredient_id, from_unit, base_quantity, base_unit FROM unit_conversions`,
      );
      const conversionsByIngredient = new Map<string, typeof conversions>();
      for (const conversion of conversions) {
        const rows = conversionsByIngredient.get(conversion.ingredient_id) ?? [];
        rows.push(conversion);
        conversionsByIngredient.set(conversion.ingredient_id, rows);
      }

      await db.execAsync(`
        ALTER TABLE ingredient_price_history
          ADD COLUMN purchase_base_quantity TEXT NOT NULL DEFAULT '1';
        ALTER TABLE ingredient_price_history
          ADD COLUMN purchase_base_unit TEXT NOT NULL DEFAULT 'pc';
        ALTER TABLE ingredient_price_history
          ADD COLUMN usable_yield_pct TEXT NOT NULL DEFAULT '100';

        DROP INDEX recipe_items_recipe_idx;
        DROP INDEX recipe_items_reference_idx;
        CREATE TABLE recipe_items_v9 (
          id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
          recipe_id TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
          kind TEXT NOT NULL CHECK (kind IN ('ingredient', 'recipe')),
          reference_id TEXT NOT NULL,
          quantity TEXT NOT NULL,
          unit TEXT NOT NULL CHECK (
            unit IN ('mg', 'kg', 'g', 'lb', 'oz', 'L', 'ml', 'fl oz', 'piece', 'pc', 'dozen', 'pack', 'cup', 'tbsp', 'tsp', 'portion')
          )
        );
        INSERT INTO recipe_items_v9 (id, recipe_id, kind, reference_id, quantity, unit)
          SELECT id, recipe_id, kind, reference_id, quantity, unit FROM recipe_items;
        DROP TABLE recipe_items;
        ALTER TABLE recipe_items_v9 RENAME TO recipe_items;
        CREATE INDEX recipe_items_recipe_idx ON recipe_items(recipe_id);
        CREATE INDEX recipe_items_reference_idx ON recipe_items(kind, reference_id);
        PRAGMA user_version = 9;
      `);

      for (const row of historyRows) {
        if (!PURCHASE_UNITS.includes(row.purchase_unit as PurchaseUnit)) {
          throw new Error(`Unknown purchase unit in ingredient history: ${row.purchase_unit}.`);
        }
        const conversion = conversionsByIngredient
          .get(row.ingredient_id)
          ?.find((candidate) => candidate.from_unit === row.purchase_unit);
        const baseAmount = quantityInBaseUnits(
          row.purchase_quantity,
          row.purchase_unit as PurchaseUnit,
          conversion
            ? { baseQuantity: conversion.base_quantity, baseUnit: conversion.base_unit }
            : undefined,
        );
        const ingredient = await db.getFirstAsync<{ usable_yield_pct: string }>(
          `SELECT usable_yield_pct FROM ingredients WHERE id = ?`,
          row.ingredient_id,
        );
        await db.runAsync(
          `UPDATE ingredient_price_history
           SET purchase_base_quantity = ?, purchase_base_unit = ?, usable_yield_pct = ?
           WHERE id = ?`,
          baseAmount.quantity.toString(),
          baseAmount.unit,
          ingredient?.usable_yield_pct ?? '100',
          row.id,
        );
      }
    });
    currentVersion = 9;
  }
}
