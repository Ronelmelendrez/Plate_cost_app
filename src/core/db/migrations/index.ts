import type { SQLiteDatabase } from 'expo-sqlite';

const DATABASE_VERSION = 6;

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
}
