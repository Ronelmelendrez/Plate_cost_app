import type { SQLiteDatabase } from 'expo-sqlite';

const DATABASE_VERSION = 2;

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
}
