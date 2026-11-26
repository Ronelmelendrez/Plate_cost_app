import type { SQLiteDatabase } from 'expo-sqlite';

const DATABASE_VERSION = 1;

export async function migrateDbIfNeeded(db: SQLiteDatabase) {
  const versionRow = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const currentVersion = versionRow?.user_version ?? 0;

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
      PRAGMA user_version = ${DATABASE_VERSION};
    `);
    });
    return;
  }

  await db.execAsync(`PRAGMA user_version = ${DATABASE_VERSION}`);
}
