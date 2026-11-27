import { FlashList } from '@shopify/flash-list';
import Slider from '@react-native-community/slider';
import { Decimal } from 'decimal.js';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import type { ComponentProps } from 'react';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { SafeAreaView } from 'react-native-safe-area-context';

import { currencyFractionDigits } from '@core/costing/money';
import { createDrizzleClient } from '@core/db/client';
import {
  getBackupReminderKind,
  recordBackupExport,
  shareBackupFile,
  SharingUnavailableError,
  snoozeBackupReminder,
} from '@features/backup';
import { getRecipeWorkspace } from '@features/recipes';
import {
  DashboardHeader,
  HERO_BOTTOM,
  HERO_TOP,
} from '@features/dashboard/components/DashboardHeader';
import { MarginDishRow } from '@features/dashboard/components/MarginDishRow';
import {
  buildMarginDashboardRows,
  getMarginStatus,
  sortMarginDashboardRows,
} from '@features/dashboard/domain/marginDashboard';
import {
  filterMarginDashboardRows,
  searchMarginDashboardRows,
  type MarginDashboardFilter,
} from '@features/dashboard/domain/marginFilters';
import { saveTargetMargin, type AppSettings } from '@features/settings';
import { Colors } from '@shared/theme';

type RecipeWorkspace = Awaited<ReturnType<typeof getRecipeWorkspace>>;

export default function DashboardScreen() {
  const sqlite = useSQLiteContext();
  const database = useMemo(() => createDrizzleClient(sqlite), [sqlite]);
  const { t } = useTranslation();
  const [workspace, setWorkspace] = useState<RecipeWorkspace>();
  const [settings, setSettings] = useState<AppSettings>();
  const [selectedChannelId, setSelectedChannelId] = useState('');
  const [marginFilter, setMarginFilter] = useState<MarginDashboardFilter>('all');
  const [query, setQuery] = useState('');
  const [targetMargin, setTargetMargin] = useState(65);
  const [savedTargetMargin, setSavedTargetMargin] = useState(65);
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingTarget, setIsSavingTarget] = useState(false);
  const [isBackupBusy, setIsBackupBusy] = useState(false);
  const [backupReminderError, setBackupReminderError] = useState('');
  const [error, setError] = useState('');

  const loadDashboard = useCallback(async () => {
    setError('');
    setIsLoading(true);
    try {
      const currentWorkspace = await getRecipeWorkspace(database);
      const currentSettings = currentWorkspace.settings;
      const initialTarget = Number(
        new Decimal(currentSettings.targetMarginPct).toDecimalPlaces(1).toString(),
      );
      const preferredChannel =
        currentWorkspace.channels.find((channel) => channel.id === 'dine-in') ??
        currentWorkspace.channels.find((channel) => channel.isDefault) ??
        currentWorkspace.channels[0];

      setSettings(currentSettings);
      setWorkspace(currentWorkspace);
      setTargetMargin(initialTarget);
      setSavedTargetMargin(initialTarget);
      setSelectedChannelId((currentId) =>
        currentWorkspace.channels.some((channel) => channel.id === currentId)
          ? currentId
          : preferredChannel?.id ?? '',
      );
    } catch (loadError) {
      console.error('Unable to load the margins dashboard.', loadError);
      setError(t('dashboard.loadError'));
    } finally {
      setIsLoading(false);
    }
  }, [database, t]);

  useFocusEffect(
    useCallback(() => {
      void loadDashboard();
    }, [loadDashboard]),
  );

  const fractionDigits = settings
    ? currencyFractionDigits(settings.currencyCode, settings.locale)
    : 2;
  const locale = settings?.locale ?? 'en-US';
  const rowResult = useMemo(() => {
    if (!workspace || !selectedChannelId) {
      return { rows: [], error: '' };
    }
    try {
      return {
        rows: sortMarginDashboardRows(
          buildMarginDashboardRows(workspace, selectedChannelId, fractionDigits),
        ),
        error: '',
      };
    } catch (calculationError) {
      console.error('Unable to calculate dashboard margins.', calculationError);
      return { rows: [], error: t('dashboard.calculationError') };
    }
  }, [fractionDigits, selectedChannelId, t, workspace]);
  const rows = rowResult.rows;
  const searchedRows = searchMarginDashboardRows(rows, query, locale);
  const searchedPricedRows = searchedRows.filter((row) => row.marginPct !== undefined);
  const searchBelowTargetCount = searchedPricedRows.filter((row) =>
    row.marginPct?.lt(targetMargin),
  ).length;
  const searchTargetMetCount = searchedPricedRows.length - searchBelowTargetCount;
  const pricedRows = rows.filter((row) => row.marginPct !== undefined);
  const belowTargetCount = pricedRows.filter((row) =>
    row.marginPct?.lt(targetMargin),
  ).length;
  const visibleRows = filterMarginDashboardRows(
    searchedRows,
    marginFilter,
    new Decimal(targetMargin),
  );
  const targetMarginLabel = new Intl.NumberFormat(settings?.locale ?? 'en-US', {
    style: 'percent',
    maximumFractionDigits: 1,
  }).format(targetMargin / 100);

  const saveTarget = async (value: number) => {
    const roundedValue = Number(value.toFixed(1));
    setTargetMargin(roundedValue);
    setIsSavingTarget(true);
    setError('');
    try {
      await saveTargetMargin(database, roundedValue);
      setSavedTargetMargin(roundedValue);
      setSettings((current) =>
        current ? { ...current, targetMarginPct: String(roundedValue) } : current,
      );
    } catch (saveError) {
      console.error('Unable to save the dashboard target margin.', saveError);
      setTargetMargin(savedTargetMargin);
      setError(t('dashboard.targetSaveError'));
    } finally {
      setIsSavingTarget(false);
    }
  };

  const dishCount = workspace?.recipes.filter((recipe) => !recipe.isSubRecipe).length ?? 0;
  const backupReminderKind = settings ? getBackupReminderKind(settings, dishCount) : null;
  const currency = settings?.currencyCode ?? 'USD';

  const createReminderBackup = async () => {
    setIsBackupBusy(true);
    setBackupReminderError('');
    try {
      await shareBackupFile(database, t('settings.backupShareTitle'));
    } catch (backupError) {
      console.error('Unable to create or share a reminder backup.', backupError);
      setBackupReminderError(
        backupError instanceof SharingUnavailableError
          ? t('settings.sharingUnavailable')
          : t('settings.backupExportError'),
      );
      setIsBackupBusy(false);
      return;
    }

    try {
      const lastBackupAt = await recordBackupExport(database);
      setSettings((current) =>
        current
          ? { ...current, lastBackupAt, backupReminderSnoozedUntil: null }
          : current,
      );
    } catch (backupError) {
      console.error('Unable to update the reminder after backup export.', backupError);
      setBackupReminderError(t('dashboard.backupReminderSaveError'));
    } finally {
      setIsBackupBusy(false);
    }
  };

  const snoozeReminder = async () => {
    setBackupReminderError('');
    try {
      const backupReminderSnoozedUntil = await snoozeBackupReminder(database);
      setSettings((current) =>
        current ? { ...current, backupReminderSnoozedUntil } : current,
      );
    } catch (snoozeError) {
      console.error('Unable to snooze the backup reminder.', snoozeError);
      setBackupReminderError(t('dashboard.backupReminderSaveError'));
    }
  };

  const filterTiles = [
    { id: 'all', label: t('dashboard.filterAll'), count: searchedRows.length },
    { id: 'below-target', label: t('dashboard.filterBelowTarget'), count: searchBelowTargetCount },
    { id: 'target-met', label: t('dashboard.filterTargetMet'), count: searchTargetMetCount },
  ] satisfies { id: MarginDashboardFilter; label: string; count: number }[];
  const isMeetingTarget = pricedRows.length > 0 && belowTargetCount === 0;
  const summaryTone = !pricedRows.length
    ? {
        className: 'bg-bg',
        color: Colors.light.tabIconDefault,
        icon: {
          ios: 'info.circle.fill',
          android: 'info',
          web: 'info',
        } as ComponentProps<typeof SymbolView>['name'],
      }
    : isMeetingTarget
      ? {
          className: 'bg-goodSoft',
          color: Colors.light.good,
          icon: {
            ios: 'checkmark.circle.fill',
            android: 'check_circle',
            web: 'check_circle',
          } as ComponentProps<typeof SymbolView>['name'],
        }
      : {
          className: 'bg-warnSoft',
          color: Colors.light.warn,
          icon: {
            ios: 'exclamationmark.circle.fill',
            android: 'warning',
            web: 'warning',
          } as ComponentProps<typeof SymbolView>['name'],
        };

  const dashboardHeader = (
    <View>
      {/* Continues the hero gradient so the summary cards float over it. */}
      <LinearGradient
        colors={[HERO_BOTTOM, Colors.light.background] as const}
        locations={[0.25, 1]}
        style={{ height: dishCount > 0 ? 140 : 72 }}
      />

      {dishCount > 0 ? (
        <View className="-mt-28 flex-row gap-3 px-4">
          {filterTiles.map((tile) => {
            const selected = tile.id === marginFilter;
            return (
              <Pressable
                key={tile.id}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityLabel={t('dashboard.selectDishFilter', {
                  filter: tile.label,
                  count: tile.count,
                })}
                onPress={() => setMarginFilter(tile.id)}
                className={`flex-1 items-center gap-1 rounded-3xl border px-2 py-3 shadow-sm ${
                  selected ? 'border-brand bg-brandSoft' : 'border-line bg-surface'
                }`}>
                <Text
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.5}
                  className={`font-inter-extrabold text-[26px] leading-[30px] ${
                    selected ? 'text-brand' : 'text-ink'
                  }`}>
                  {tile.count}
                </Text>
                <Text
                  numberOfLines={2}
                  className={`text-center font-inter-semibold text-[10px] uppercase tracking-[0.4px] ${
                    selected ? 'text-brand' : 'text-muted'
                  }`}>
                  {tile.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      <View className="mt-4 gap-3 px-4">
        {workspace && workspace.channels.length > 0 ? (
          <View className="gap-3 rounded-3xl border border-line bg-surface p-4 shadow-sm">
            <View className="gap-1">
              <Text className="font-inter-bold text-[11px] uppercase tracking-[0.8px] text-brand">
                {t('pricing.salesChannel')}
              </Text>
              <Text className="font-inter text-[13px] leading-[18px] text-muted">
                {t('dashboard.channelHint')}
              </Text>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerClassName="gap-2">
              {workspace.channels.map((channel) => {
                const selected = channel.id === selectedChannelId;
                return (
                  <Pressable
                    key={channel.id}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    accessibilityLabel={t('dashboard.selectChannel', { name: channel.name })}
                    onPress={() => setSelectedChannelId(channel.id)}
                    className={`min-h-11 items-center justify-center rounded-full border px-4 ${
                      selected ? 'border-brand bg-brand shadow-sm' : 'border-line bg-bg'
                    }`}>
                    <Text
                      className={`text-[14px] ${
                        selected ? 'font-inter-semibold text-white' : 'font-inter-medium text-ink'
                      }`}>
                      {channel.name}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        ) : null}

        {workspace ? (
          <View className="gap-3 rounded-3xl border border-line bg-surface p-4 shadow-sm">
            <View className="flex-row items-start justify-between gap-3">
              <View className="min-w-0 flex-1 gap-1">
                <Text className="font-inter-bold text-[15px] leading-[20px] text-ink">
                  {t('dashboard.targetMargin')}
                </Text>
                <Text className="font-inter text-[13px] leading-[18px] text-muted">
                  {t('dashboard.targetMarginHint')}
                </Text>
              </View>
              <View className="shrink-0 items-center rounded-2xl bg-brandSoft px-3 py-2">
                <Text
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.6}
                  className="font-inter-extrabold text-[22px] leading-[26px] text-brand">
                  {targetMarginLabel}
                </Text>
              </View>
            </View>
            <Slider
              accessibilityLabel={t('dashboard.targetMargin')}
              minimumValue={0}
              maximumValue={100}
              step={0.1}
              value={targetMargin}
              onValueChange={(value) => setTargetMargin(Number(value.toFixed(1)))}
              onSlidingComplete={(value) => void saveTarget(value)}
              disabled={isSavingTarget}
              minimumTrackTintColor={Colors.light.tint}
              maximumTrackTintColor={Colors.light.line}
              thumbTintColor={Colors.light.tint}
              thumbSize={28}
              style={{ height: 48, width: '100%' }}
            />
            <View
              className={`flex-row items-start gap-2 rounded-2xl px-3.5 py-3 ${summaryTone.className}`}>
              <SymbolView
                name={summaryTone.icon}
                tintColor={summaryTone.color}
                size={16}
                style={{ marginTop: 1 }}
              />
              <Text
                accessibilityRole="summary"
                className="flex-1 font-inter text-[13px] leading-[18px] text-ink">
                {pricedRows.length > 0
                  ? t('dashboard.belowTargetSummary', {
                      count: pricedRows.length,
                      below: belowTargetCount,
                      total: pricedRows.length,
                    })
                  : t('dashboard.noPricedDishes')}
              </Text>
            </View>
          </View>
        ) : null}

        {backupReminderKind ? (
          <View className="gap-3 rounded-3xl border border-[#F2E3C6] bg-[#FFF9EC] p-4">
            <View className="flex-row items-center gap-2">
              <SymbolView
                name={{
                  ios: 'exclamationmark.shield.fill',
                  android: 'security',
                  web: 'security',
                }}
                tintColor={Colors.light.warn}
                size={18}
              />
              <Text className="font-inter-bold text-[15px] text-ink">
                {t('dashboard.backupReminderTitle')}
              </Text>
            </View>
            <Text className="font-inter text-[13px] leading-[19px] text-muted">
              {t(`dashboard.backupReminder.${backupReminderKind}`)}
            </Text>
            {backupReminderError ? (
              <Text accessibilityRole="alert" className="font-inter-semibold text-[13px] text-bad">
                {backupReminderError}
              </Text>
            ) : null}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('dashboard.createBackup')}
              disabled={isBackupBusy}
              onPress={() => void createReminderBackup()}
              className={`min-h-12 items-center justify-center rounded-2xl border border-line bg-surface px-4 ${
                isBackupBusy ? 'opacity-50' : ''
              }`}>
              <Text className="font-inter-semibold text-[15px] text-ink">
                {t('dashboard.createBackup')}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('dashboard.remindBackupLater')}
              onPress={() => void snoozeReminder()}
              className="min-h-11 items-center justify-center">
              <Text className="font-inter-semibold text-[14px] text-brand">
                {t('dashboard.remindBackupLater')}
              </Text>
            </Pressable>
          </View>
        ) : null}

        {rowResult.error ? (
          <View className="rounded-2xl border border-line bg-badSoft p-3.5">
            <Text accessibilityRole="alert" className="font-inter text-[14px] leading-[20px] text-bad">
              {rowResult.error}
            </Text>
          </View>
        ) : null}

        {error ? (
          <View className="rounded-2xl border border-line bg-badSoft p-3.5">
            <Text accessibilityRole="alert" className="font-inter text-[14px] leading-[20px] text-bad">
              {error}
            </Text>
            {!workspace ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('dashboard.retry')}
                onPress={() => void loadDashboard()}
                className="min-h-11 justify-center">
                <Text className="font-inter-semibold text-[14px] text-brand">{t('dashboard.retry')}</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {dishCount > 0 ? (
          <View className="flex-row items-center justify-between pt-2 pb-1">
            <Text className="font-inter-extrabold text-[18px] text-ink">
              {t('dashboard.dishesHeading')}
            </Text>
            <View className="rounded-full bg-brandSoft px-2.5 py-1">
              <Text className="font-inter-bold text-[11px] text-brand">{visibleRows.length}</Text>
            </View>
          </View>
        ) : null}
      </View>
    </View>
  );

  return (
    <SafeAreaView edges={['top']} className="flex-1" style={{ backgroundColor: HERO_TOP }}>
      <DashboardHeader
        query={query}
        onChangeQuery={setQuery}
        onOpenAnalytics={() =>
          router.push({
            pathname: '/analytics',
            params: { channelId: selectedChannelId },
          })
        }
      />
      <FlashList
        data={visibleRows}
        keyExtractor={(item) => item.recipeId}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        ListHeaderComponent={dashboardHeader}
        renderItem={({ item }) => (
          <View className="px-4">
            <MarginDishRow
              row={item}
              status={item.marginPct ? getMarginStatus(item.marginPct, new Decimal(targetMargin)) : undefined}
              currency={currency}
              locale={locale}
              onPress={() => router.push(`/recipe/${item.recipeId}`)}
            />
          </View>
        )}
        ListEmptyComponent={
          isLoading ? (
            <Text className="py-8 text-center font-inter text-[15px] text-muted">
              {t('dashboard.loading')}
            </Text>
          ) : !workspace ? null : dishCount === 0 ? (
            <View className="items-center gap-2 px-6 py-10">
              <View className="h-14 w-14 items-center justify-center rounded-full bg-brandSoft">
                <SymbolView
                  name={{
                    ios: 'fork.knife',
                    android: 'restaurant_menu',
                    web: 'restaurant_menu',
                  }}
                  tintColor={Colors.light.tint}
                  size={26}
                />
              </View>
              <Text className="mt-1 font-inter-bold text-[17px] text-ink">
                {t('dashboard.emptyTitle')}
              </Text>
              <Text className="text-center font-inter text-[14px] leading-[20px] text-muted">
                {t('dashboard.emptyBody')}
              </Text>
            </View>
          ) : query.trim() && searchedRows.length === 0 ? (
            <View className="items-center gap-2 px-4 py-8">
              <Text className="text-center font-inter text-[14px] text-muted">
                {t('dashboard.searchNoResults')}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('dashboard.clearSearch')}
                onPress={() => setQuery('')}
                className="min-h-11 justify-center">
                <Text className="font-inter-semibold text-[14px] text-brand">
                  {t('dashboard.clearSearch')}
                </Text>
              </Pressable>
            </View>
          ) : marginFilter !== 'all' ? (
            <View className="items-center gap-2 px-4 py-8">
              <Text className="text-center font-inter text-[14px] text-muted">
                {t('dashboard.noDishesInFilter')}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('dashboard.showAllDishes')}
                onPress={() => setMarginFilter('all')}
                className="min-h-11 justify-center">
                <Text className="font-inter-semibold text-[14px] text-brand">
                  {t('dashboard.showAllDishes')}
                </Text>
              </Pressable>
            </View>
          ) : null
        }
        contentContainerStyle={{
          flexGrow: 1,
          paddingBottom: 24,
        }}
        style={{ flex: 1, backgroundColor: Colors.light.background }}
      />
    </SafeAreaView>
  );
}
