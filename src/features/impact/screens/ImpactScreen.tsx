import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { createDrizzleClient } from '@core/db/client';
import {
  getPriceChangeImpact,
  type PriceChangeImpactReport,
} from '@features/impact/data/impactRepository';
import { ImpactDishRow } from '@features/impact/components/PriceChangeImpactSheet';
import { getImpactSource } from '@features/impact/domain/impactSource';
import { Button } from '@shared/ui';
import { Colors } from '@shared/theme';

export default function ImpactScreen() {
  const { kind, id } = useLocalSearchParams<{ kind?: string; id?: string }>();
  const sourceType = typeof kind === 'string' ? kind : undefined;
  const sourceId = typeof id === 'string' ? id : undefined;
  const sqlite = useSQLiteContext();
  const database = useMemo(() => createDrizzleClient(sqlite), [sqlite]);
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [report, setReport] = useState<PriceChangeImpactReport | null>(null);
  const [loadError, setLoadError] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  const loadImpact = useCallback(async () => {
    setLoadError('');
    setIsLoading(true);
    const source = getImpactSource(sourceType, sourceId);
    if (!source) {
      setLoadError(t('impact.loadError'));
      setIsLoading(false);
      return;
    }

    try {
      setReport(await getPriceChangeImpact(database, source));
    } catch (error) {
      console.error('Unable to load price-change impact.', error);
      setReport(null);
      setLoadError(t('impact.loadError'));
    } finally {
      setIsLoading(false);
    }
  }, [database, sourceId, sourceType, t]);

  useFocusEffect(
    useCallback(() => {
      void loadImpact();
    }, [loadImpact]),
  );

  const openDish = (recipeId: string) => {
    router.push(`/recipe/${recipeId}`);
  };

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-bg">
      <View className="flex-row items-center gap-3 border-b border-line bg-surface px-4 py-3">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('impact.close')}
          onPress={() => router.back()}
          className="h-12 w-12 items-center justify-center rounded-xl border border-line bg-bg">
          <SymbolView
            name={{ ios: 'chevron.left', android: 'arrow_back', web: 'arrow_back' }}
            tintColor={Colors.light.tabIconDefault}
            size={22}
          />
        </Pressable>
        <Text accessibilityRole="header" className="font-inter-extrabold text-[22px] text-ink">
          {t('impact.title')}
        </Text>
      </View>
      {loadError ? (
        <View className="flex-1 justify-center gap-3 px-4">
          <View className="gap-3 rounded-3xl border border-line bg-badSoft p-4">
            <Text accessibilityRole="alert" className="font-inter text-[15px] leading-[22px] text-bad">
              {loadError}
            </Text>
            <Button label={t('impact.retry')} onPress={() => void loadImpact()} />
          </View>
        </View>
      ) : isLoading && !report ? (
        <Text className="py-8 text-center font-inter text-[15px] text-muted">
          {t('dashboard.loading')}
        </Text>
      ) : report ? (
        <>
          <ScrollView
            className="flex-1"
            contentContainerClassName="gap-3 px-4 pb-6 pt-4"
            keyboardShouldPersistTaps="handled">
            <View className="gap-2 rounded-3xl border border-line bg-surface p-4 shadow-sm">
              <Text className="font-inter-bold text-[16px] leading-[22px] text-ink">
                {report.sourceName}
              </Text>
              <Text className="font-inter-semibold text-[14px] leading-[20px] text-ink">
                {t('impact.affectedSummary', { count: report.dishes.length })}
              </Text>
              <Text className="font-inter text-[14px] leading-[20px] text-muted">
                {t('impact.belowSummary', { count: report.belowTargetCount })}
              </Text>
              <Text className="font-inter text-[12px] leading-[17px] text-muted">
                {t('impact.channelNote')}
              </Text>
            </View>
            {report.dishes.length > 0 ? (
              report.dishes.map((dish) => (
                <ImpactDishRow
                  key={dish.recipeId}
                  dish={dish}
                  currency={report.currency}
                  locale={report.locale}
                  onPress={() => openDish(dish.recipeId)}
                />
              ))
            ) : (
              <View className="items-center rounded-3xl border border-line bg-surface px-5 py-8">
                <Text className="text-center font-inter text-[14px] leading-[20px] text-muted">
                  {t('impact.noAffectedDishes')}
                </Text>
              </View>
            )}
          </ScrollView>
          <View
            className="border-t border-line bg-surface px-4 pt-3"
            style={{ paddingBottom: Math.max(12, insets.bottom) }}>
            <Button label={t('impact.done')} onPress={() => router.back()} />
          </View>
        </>
      ) : null}
    </SafeAreaView>
  );
}
