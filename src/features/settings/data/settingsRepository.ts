import { getLocales } from 'expo-localization';
import { asc, desc, eq } from 'drizzle-orm';

import { parseDecimal } from '@core/costing/money';
import type { AppDatabase } from '@core/db/client';
import { channels, globalSettings } from '@core/db/schema';

export type AppSettings = typeof globalSettings.$inferSelect;
export type SalesChannel = typeof channels.$inferSelect;

export type AppSettingsDraft = Pick<
  AppSettings,
  | 'locale'
  | 'currencyCode'
  | 'unitSystem'
  | 'cupMl'
  | 'tablespoonMl'
  | 'pricesIncludeTax'
  | 'taxPct'
  | 'wastePct'
  | 'targetMarginPct'
  | 'feesOnTaxIncludedPrice'
>;

export interface SalesChannelDraft {
  id?: string;
  name: string;
  commissionPct: string;
  paymentFeePct: string;
  isDefault: boolean;
}

function isWithinRange(value: string, maximum: number, locale: string) {
  const decimal = parseDecimal(value, locale);
  return Boolean(decimal && decimal.gte(0) && decimal.lte(maximum));
}

function isPositiveWithinRange(value: string, maximum: number, locale: string) {
  const decimal = parseDecimal(value, locale);
  return Boolean(decimal && decimal.gt(0) && decimal.lte(maximum));
}

function canonicalDecimal(value: string, locale: string) {
  const decimal = parseDecimal(value, locale);
  if (!decimal) {
    throw new Error('A settings number could not be parsed.');
  }
  return decimal.toString();
}

export function validateSettingsDraft(
  settings: AppSettingsDraft,
  channelDrafts: SalesChannelDraft[],
) {
  if (!/^[A-Z]{3}$/.test(settings.currencyCode)) {
    return 'currency';
  }
  try {
    new Intl.NumberFormat(settings.locale, {
      style: 'currency',
      currency: settings.currencyCode,
    });
  } catch {
    return 'currency';
  }
  if (
    !isWithinRange(settings.wastePct, 100, settings.locale) ||
    !isWithinRange(settings.targetMarginPct, 100, settings.locale) ||
    !isWithinRange(settings.taxPct, 100, settings.locale) ||
    !isPositiveWithinRange(settings.cupMl, 2000, settings.locale) ||
    !isPositiveWithinRange(settings.tablespoonMl, 100, settings.locale)
  ) {
    return 'settings';
  }
  if (channelDrafts.length === 0) {
    return 'channels';
  }

  const names = new Set<string>();
  for (const channel of channelDrafts) {
    const normalizedName = channel.name.trim().toLocaleLowerCase();
    if (
      !normalizedName ||
      names.has(normalizedName) ||
      !isWithinRange(channel.commissionPct, 100, settings.locale) ||
      !isWithinRange(channel.paymentFeePct, 100, settings.locale)
    ) {
      return 'channels';
    }
    names.add(normalizedName);
  }
  return undefined;
}

export async function getAppSettings(database: AppDatabase) {
  const [settings] = await database
    .select()
    .from(globalSettings)
    .where(eq(globalSettings.id, 1))
    .limit(1);
  if (!settings) {
    throw new Error('Global settings are missing from the database.');
  }
  if (settings.isInitialized) {
    return settings;
  }

  const deviceLocale = getLocales()[0];
  const locale = deviceLocale?.languageTag ?? 'en-US';
  const measurementSystem = deviceLocale?.measurementSystem;
  const unitSystem = measurementSystem === 'us' || measurementSystem === 'uk' ? 'us' : 'metric';
  await database
    .update(globalSettings)
    .set({
      locale,
      currencyCode: deviceLocale?.currencyCode ?? 'USD',
      unitSystem,
      cupMl: unitSystem === 'us' ? '240' : '250',
      tablespoonMl: '15',
      isInitialized: true,
    })
    .where(eq(globalSettings.id, 1));

  const [initialized] = await database
    .select()
    .from(globalSettings)
    .where(eq(globalSettings.id, 1))
    .limit(1);
  if (!initialized) {
    throw new Error('Global settings could not be initialized.');
  }
  return initialized;
}

export async function listSalesChannels(database: AppDatabase) {
  return database
    .select()
    .from(channels)
    .orderBy(desc(channels.isDefault), asc(channels.name));
}

export async function saveSettings(
  database: AppDatabase,
  settings: AppSettingsDraft,
  channelDrafts: SalesChannelDraft[],
) {
  const validationError = validateSettingsDraft(settings, channelDrafts);
  if (validationError) {
    throw new Error(`Settings validation failed: ${validationError}.`);
  }

  await database.transaction(async (transaction) => {
    const [existingSettings] = await transaction
      .select({ id: globalSettings.id })
      .from(globalSettings)
      .where(eq(globalSettings.id, 1))
      .limit(1);
    if (!existingSettings) {
      throw new Error('Global settings are missing from the database.');
    }
    await transaction
      .update(globalSettings)
      .set({ ...settings, isInitialized: true })
      .where(eq(globalSettings.id, 1));

    const existingChannels = await transaction.select({ id: channels.id }).from(channels);
    const existingChannelIds = new Set(existingChannels.map((channel) => channel.id));
    for (const channel of channelDrafts) {
      const values = {
        name: channel.name.trim(),
        commissionPct: canonicalDecimal(channel.commissionPct, settings.locale),
        paymentFeePct: canonicalDecimal(channel.paymentFeePct, settings.locale),
        isDefault: channel.isDefault,
      };
      if (channel.id && existingChannelIds.has(channel.id)) {
        await transaction.update(channels).set(values).where(eq(channels.id, channel.id));
      } else {
        if (channel.id) {
          throw new Error('A sales channel no longer exists.');
        }
        await transaction.insert(channels).values(values);
      }
    }
  });
}
