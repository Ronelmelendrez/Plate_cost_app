import { FlashList } from '@shopify/flash-list';
import { Decimal } from 'decimal.js';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { SafeAreaView } from 'react-native-safe-area-context';

import { currencyFractionDigits } from '@core/costing/money';
import { createDrizzleClient } from '@core/db/client';
import { getRecipeWorkspace } from '@features/recipes';
import { MarginDishRow } from '@features/dashboard/components/MarginDishRow';
import {
  buildMarginDashboardRows,
  getMarginStatus,
  sortMarginDashboardRows,
  type MarginDashboardRow,
} from '@features/dashboard/domain/marginDashboard';
import { summarizeMarginDashboardRows } from '@features/dashboard/domain/marginAnalytics';
import { Colors, HERO_BOTTOM, HERO_TOP } from '@shared/theme';

type RecipeWorkspace = Awaited<ReturnType<typeof getRecipeWorkspace>>;

function formatMargin(value: Decimal, locale: string) {
  return new Intl.NumberFormat(locale, {
    style: 'percent',
    maximumFractionDigits: 1,
  }).format(value.div(100).toNumber());
}

function MetricCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <View className="min-h-28 flex-1 gap-1.5 rounded-3xl border border-line bg-surface p-4 shadow-sm">
      <Text
        numberOfLines={2}
        className="font-inter-semibold text-[11px] uppercase tracking-[0.6px] text-muted">
        {label}
      </Text>
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.5}
        className="font-inter-extrabold text-[24px] leading-[28px] text-ink">
        {value}
      </Text>
      <Text numberOfLines={2} className="font-inter text-[12px] leading-[16px] text-muted">
        {detail}
      </Text>
    </View>
  );
}

export default function AnalyticsScreen() {
  const sqlite = useSQLiteContext();
  const database = useMemo(() => createDrizzleClient(sqlite), [sqlite]);
  const { t } = useTranslation();
  const { channelId: requestedChannelId } = useLocalSearchParams<{ channelId?: string }>();
  const [workspace, setWorkspace] = useState<RecipeWorkspace>();
  const [selectedChannelId, setSelectedChannelId] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const loadAnalytics = useCallback(async () => {
    setError('');
    setIsLoading(true);
    try {
      const currentWorkspace = await getRecipeWorkspace(database);
      const preferredChannel =
        currentWorkspace.channels.find((channel) => channel.id === requestedChannelId) ??
        currentWorkspace.channels.find((channel) => channel.id === 'dine-in') ??
        currentWorkspace.channels.find((channel) => channel.isDefault) ??
        currentWorkspace.channels[0];

      setWorkspace(currentWorkspace);
      setSelectedChannelId((currentId) =>
        currentWorkspace.channels.some((channel) => channel.id === currentId)
          ? currentId
          : preferredChannel?.id ?? '',
      );
    } catch (loadError) {
      console.error('Unable to load margin analytics.', loadError);
      setError(t('analytics.loadError'));
    } finally {
      setIsLoading(false);
    }
  }, [database, requestedChannelId, t]);

  useFocusEffect(
    useCallback(() => {
      void loadAnalytics();
    }, [loadAnalytics]),
  );

  const settings = workspace?.settings;
  const locale = settings?.locale ?? 'en-US';
  const currency = settings?.currencyCode ?? 'USD';
  const fractionDigits = settings
    ? currencyFractionDigits(settings.currencyCode, settings.locale)
    : 2;
  const rowResult = useMemo(() => {
    if (!workspace || !selectedChannelId) {
      return { rows: [] as MarginDashboardRow[], error: '' };
    }
    try {
      return {
        rows: sortMarginDashboardRows(
          buildMarginDashboardRows(workspace, selectedChannelId, fractionDigits),
        ),
        error: '',
      };
    } catch (calculationError) {
      console.error('Unable to calculate margin analytics.', calculationError);
      return { rows: [] as MarginDashboardRow[], error: t('analytics.calculationError') };
    }
  }, [fractionDigits, selectedChannelId, t, workspace]);
  const targetMargin = new Decimal(settings?.targetMarginPct ?? '65');
  const summary = summarizeMarginDashboardRows(rowResult.rows, targetMargin);
  const { averageMarginPct, bestMarginRow, belowTargetCount, lowestMarginRow, pricedCount } =
    summary;
  const pricedRows = rowResult.rows.filter(
    (row): row is MarginDashboardRow & { marginPct: Decimal } =>
      row.marginPct !== undefined,
  );
  const dishCount = workspace?.recipes.filter((recipe) => !recipe.isSubRecipe).length ?? 0;
  const selectedChannel = workspace?.channels.find(
    (channel) => channel.id === selectedChannelId,
  );

  const analyticsHeader = (
    <View className="gap-4 px-4 pb-6 pt-5">
      <Text className="font-inter text-[14px] leading-[20px] text-muted">
        {t('analytics.subtitle')}
      </Text>

      {workspace && workspace.channels.length > 0 ? (
        <View className="gap-2.5">
          <Text className="font-inter-bold text-[11px] uppercase tracking-[0.8px] text-brand">
            {t('analytics.channel')}
          </Text>
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
                  accessibilityLabel={t('analytics.selectChannel', {
                    name: channel.name,
                  })}
                  onPress={() => setSelectedChannelId(channel.id)}
                  className={`min-h-11 items-center justify-center rounded-full border px-4 ${
                    selected ? 'border-brand bg-brand shadow-sm' : 'border-line bg-surface'
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

      {error ? (
        <View className="gap-2 rounded-2xl border border-line bg-badSoft p-3.5">
          <Text accessibilityRole="alert" className="font-inter text-[14px] text-bad">
            {error}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('analytics.retry')}
            onPress={() => void loadAnalytics()}
            className="min-h-11 justify-center">
            <Text className="font-inter-semibold text-[14px] text-brand">{t('analytics.retry')}</Text>
          </Pressable>
        </View>
      ) : null}

      {rowResult.error ? (
        <View className="rounded-2xl border border-line bg-badSoft p-3.5">
          <Text accessibilityRole="alert" className="font-inter text-[14px] text-bad">
            {rowResult.error}
          </Text>
        </View>
      ) : null}

      {!isLoading && !error && !rowResult.error && averageMarginPct && bestMarginRow && lowestMarginRow ? (
        <View className="gap-3">
          <View className="flex-row gap-3">
            <MetricCard
              label={t('analytics.averageMargin')}
              value={formatMargin(averageMarginPct, locale)}
              detail={t('analytics.targetValue', {
                target: formatMargin(targetMargin, locale),
              })}
            />
            <MetricCard
              label={t('analytics.belowTarget')}
              value={`${belowTargetCount}/${pricedCount}`}
              detail={t('analytics.pricedDishes', { count: pricedCount })}
            />
          </View>
          <View className="flex-row gap-3">
            <MetricCard
              label={t('analytics.bestMargin')}
              value={formatMargin(bestMarginRow.marginPct, locale)}
              detail={bestMarginRow.name}
            />
            <MetricCard
              label={t('analytics.lowestMargin')}
              value={formatMargin(lowestMarginRow.marginPct, locale)}
              detail={lowestMarginRow.name}
            />
          </View>
          {selectedChannel ? (
            <Text className="font-inter-bold text-[15px] text-ink">
              {t('analytics.channelSummary', { channel: selectedChannel.name })}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );

  return (
    <SafeAreaView edges={['top']} className="flex-1" style={{ backgroundColor: HERO_TOP }}>
      <LinearGradient
        colors={[HERO_TOP, HERO_BOTTOM] as const}
        style={{ paddingHorizontal: 16, paddingBottom: 16, paddingTop: 8 }}>
        <View className="flex-row items-center gap-3">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('analytics.back')}
            onPress={() => router.back()}
            className="h-11 w-11 items-center justify-center rounded-full border border-white/30 bg-white/15">
            <SymbolView
              name={{ ios: 'chevron.left', android: 'arrow_back', web: 'arrow_back' }}
              tintColor="#FFFFFF"
              size={22}
            />
          </Pressable>
          <Text accessibilityRole="header" className="font-inter-extrabold text-[22px] text-white">
            {t('analytics.title')}
          </Text>
        </View>
      </LinearGradient>

      <FlashList
        data={isLoading || error || rowResult.error ? [] : pricedRows}
        keyExtractor={(row) => row.recipeId}
        renderItem={({ item }) => (
          <View className="px-4">
            <MarginDishRow
              row={item}
              status={getMarginStatus(item.marginPct, targetMargin)}
              currency={currency}
              locale={locale}
              onPress={() => router.push(`/recipe/${item.recipeId}`)}
            />
          </View>
        )}
        ListHeaderComponent={analyticsHeader}
        ListEmptyComponent={
          isLoading ? (
            <Text className="py-8 text-center font-inter text-[15px] text-muted">
              {t('dashboard.loading')}
            </Text>
          ) : error || !workspace || rowResult.error ? null : workspace.channels.length === 0 ? (
            <Text className="mx-4 rounded-2xl border border-line bg-surface p-4 font-inter text-[14px] text-muted">
              {t('analytics.noChannels')}
            </Text>
          ) : summary.pricedCount === 0 ? (
            <View className="items-center gap-2 px-4 py-8">
              <Text className="font-inter-bold text-[16px] text-ink">
                {dishCount === 0 ? t('analytics.emptyTitle') : t('analytics.noPricedDishes')}
              </Text>
              {dishCount === 0 ? (
                <Text className="text-center font-inter text-[14px] leading-[20px] text-muted">
                  {t('analytics.emptyBody')}
                </Text>
              ) : null}
            </View>
          ) : null
        }
        contentContainerStyle={{ flexGrow: 1, paddingBottom: 24 }}
        keyboardShouldPersistTaps="handled"
        style={{ flex: 1, backgroundColor: Colors.light.background }}
      />
    </SafeAreaView>
  );
}
