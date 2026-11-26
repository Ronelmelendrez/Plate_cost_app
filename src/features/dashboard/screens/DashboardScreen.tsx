import { FlashList } from '@shopify/flash-list';
import Slider from '@react-native-community/slider';
import { Decimal } from 'decimal.js';
import { router, useFocusEffect } from 'expo-router';
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
import { MarginDishRow } from '@features/dashboard/components/MarginDishRow';
import {
  buildMarginDashboardRows,
  getMarginStatus,
  sortMarginDashboardRows,
} from '@features/dashboard/domain/marginDashboard';
import {
  filterMarginDashboardRows,
  type MarginDashboardFilter,
} from '@features/dashboard/domain/marginFilters';
import { saveTargetMargin, type AppSettings } from '@features/settings';
import { Button } from '@shared/ui';
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
  const pricedRows = rows.filter((row) => row.marginPct !== undefined);
  const belowTargetCount = pricedRows.filter((row) =>
    row.marginPct?.lt(targetMargin),
  ).length;
  const targetMetCount = pricedRows.length - belowTargetCount;
  const visibleRows = filterMarginDashboardRows(rows, marginFilter, new Decimal(targetMargin));
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
  const locale = settings?.locale ?? 'en-US';

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

  const dashboardHeader = (
    <View>
      <View className="gap-1 px-4 pb-4 pt-3">
        <Text className="text-2xl font-bold text-ink">{t('dashboard.title')}</Text>
        <Text className="text-base leading-6 text-muted">{t('dashboard.subtitle')}</Text>
      </View>

      {workspace && workspace.channels.length > 0 ? (
        <View className="mx-4 mb-3 gap-3 rounded-xl border border-line bg-surface p-4">
          <View className="gap-1">
            <Text className="text-base font-semibold text-ink">
              {t('pricing.salesChannel')}
            </Text>
            <Text className="text-sm leading-5 text-muted">
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
                  className={`min-h-12 items-center justify-center rounded-full border px-4 ${
                    selected ? 'border-brand bg-brand' : 'border-line bg-bg'
                  }`}>
                  <Text className={`text-base ${selected ? 'font-semibold text-white' : 'text-ink'}`}>
                    {channel.name}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      ) : null}

      {workspace ? (
        <View className="mx-4 mb-4 gap-3 rounded-xl border border-line bg-surface p-4">
          <View className="flex-row items-center justify-between gap-3">
            <View className="flex-1 gap-1">
              <Text className="text-base font-semibold text-ink">
                {t('dashboard.targetMargin')}
              </Text>
              <Text className="text-sm leading-5 text-muted">
                {t('dashboard.targetMarginHint')}
              </Text>
            </View>
            <Text className="text-2xl font-bold text-brand">{targetMarginLabel}</Text>
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
          <View className="rounded-xl bg-bg px-3 py-3">
            {pricedRows.length > 0 ? (
              <Text accessibilityRole="summary" className="text-sm leading-5 text-muted">
                {t('dashboard.belowTargetSummary', {
                  count: pricedRows.length,
                  below: belowTargetCount,
                  total: pricedRows.length,
                })}
              </Text>
            ) : (
              <Text className="text-sm leading-5 text-muted">
                {t('dashboard.noPricedDishes')}
              </Text>
            )}
          </View>
        </View>
      ) : null}
      {backupReminderKind ? (
        <View className="mx-4 mb-3 gap-3 rounded-xl border border-line bg-surface p-4">
          <Text className="text-base font-semibold text-ink">
            {t('dashboard.backupReminderTitle')}
          </Text>
          <Text className="text-base leading-6 text-muted">
            {t(`dashboard.backupReminder.${backupReminderKind}`)}
          </Text>
          {backupReminderError ? (
            <Text accessibilityRole="alert" className="text-sm text-bad">
              {backupReminderError}
            </Text>
          ) : null}
          <Button
            label={t('dashboard.createBackup')}
            variant="secondary"
            onPress={() => void createReminderBackup()}
            disabled={isBackupBusy}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('dashboard.remindBackupLater')}
            onPress={() => void snoozeReminder()}
            className="min-h-12 items-center justify-center">
            <Text className="text-base font-semibold text-brand">
              {t('dashboard.remindBackupLater')}
            </Text>
          </Pressable>
        </View>
      ) : null}
      {rowResult.error ? (
        <Text accessibilityRole="alert" className="px-4 pt-3 text-base text-bad">
          {rowResult.error}
        </Text>
      ) : null}

      {error ? (
        <View className="px-4 pt-3">
          <Text accessibilityRole="alert" className="text-base text-bad">
            {error}
          </Text>
          {!workspace ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('dashboard.retry')}
              onPress={() => void loadDashboard()}
              className="min-h-12 justify-center">
              <Text className="text-base font-semibold text-brand">{t('dashboard.retry')}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {dishCount > 0 ? (
        <View className="mx-4 mb-3 gap-3 rounded-xl border border-line bg-surface p-4">
          <Text className="text-base font-semibold text-ink">
            {t('dashboard.filterDishes')}
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerClassName="gap-2">
            {([
              { id: 'all', label: t('dashboard.filterAll'), count: rows.length },
              {
                id: 'below-target',
                label: t('dashboard.filterBelowTarget'),
                count: belowTargetCount,
              },
              {
                id: 'target-met',
                label: t('dashboard.filterTargetMet'),
                count: targetMetCount,
              },
            ] satisfies { id: MarginDashboardFilter; label: string; count: number }[]).map(
              (filter) => {
                const selected = filter.id === marginFilter;
                return (
                  <Pressable
                    key={filter.id}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    accessibilityLabel={t('dashboard.selectDishFilter', {
                      filter: filter.label,
                      count: filter.count,
                    })}
                    onPress={() => setMarginFilter(filter.id)}
                    className={`min-h-12 flex-row items-center gap-2 rounded-full border px-4 ${
                      selected ? 'border-brand bg-brand' : 'border-line bg-bg'
                    }`}>
                    <Text
                      className={`text-base ${
                        selected ? 'font-semibold text-white' : 'text-ink'
                      }`}>
                      {filter.label}
                    </Text>
                    <Text
                      className={`text-sm ${
                        selected ? 'font-semibold text-white' : 'text-muted'
                      }`}>
                      {filter.count}
                    </Text>
                  </Pressable>
                );
              },
            )}
          </ScrollView>
        </View>
      ) : null}

      {dishCount > 0 ? (
        <Text className="px-4 pb-3 pt-1 text-lg font-semibold text-ink">
          {t('dashboard.dishesHeading')}
        </Text>
      ) : null}
    </View>
  );

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-bg">
      <FlashList
        data={visibleRows}
        keyExtractor={(item) => item.recipeId}
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
            <Text className="py-8 text-center text-base text-muted">{t('dashboard.loading')}</Text>
          ) : !workspace ? null : dishCount === 0 ? (
            <View className="items-center gap-2 px-4 py-8">
              <Text className="text-base font-semibold text-ink">
                {t('dashboard.emptyTitle')}
              </Text>
              <Text className="text-center text-base leading-6 text-muted">
                {t('dashboard.emptyBody')}
              </Text>
            </View>
          ) : marginFilter !== 'all' ? (
            <View className="items-center gap-2 px-4 py-8">
              <Text className="text-center text-base text-muted">
                {t('dashboard.noDishesInFilter')}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('dashboard.showAllDishes')}
                onPress={() => setMarginFilter('all')}
                className="min-h-12 justify-center">
                <Text className="text-base font-semibold text-brand">
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
        style={{ flex: 1 }}
      />
    </SafeAreaView>
  );
}
