import { drizzle } from 'drizzle-orm/expo-sqlite';
import type { SQLiteDatabase } from 'expo-sqlite';

import { schema } from './schema';

export function createDrizzleClient(sqlite: SQLiteDatabase) {
  return drizzle(sqlite, { schema });
}

export type AppDatabase = ReturnType<typeof createDrizzleClient>;
