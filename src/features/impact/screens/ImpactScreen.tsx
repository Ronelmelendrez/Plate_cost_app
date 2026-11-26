import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, View } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { createDrizzleClient } from '@core/db/client';
import {
  getPriceChangeImpact,
  type PriceChangeImpactReport,
  type PriceImpactSource,
} from '@features/impact/data/impactRepository';
import { ImpactDishRow } from '@features/impact/components/PriceChangeImpactSheet';
import { Button } from '@shared/ui';

function getImpactSource(
  type: string | undefined,
  id: string | undefined,
): PriceImpactSource | undefined {
  if (id && (type === 'ingredient' || type === 'recipe')) {
    return { type, id };
  }
  return undefined;
}

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

  if (isLoading && !report) {
    return <SafeAreaView edges={['top']} className="flex-1 bg-bg" />;
  }

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-bg">
      <View className="px-4 pb-3 pt-1">
        <Text className="text-xl font-semibold text-ink">{t('impact.title')}</Text>
      </View>
      {loadError ? (
        <View className="flex-1 justify-center gap-3 px-4">
          <Text accessibilityRole="alert" className="text-base text-bad">
            {loadError}
          </Text>
          <Button label={t('impact.retry')} onPress={() => void loadImpact()} />
        </View>
      ) : report ? (
        <>
          <ScrollView
            className="flex-1"
            contentContainerClassName="gap-3 px-4 pb-6"
            keyboardShouldPersistTaps="handled">
            <View className="gap-2 rounded-xl border border-line bg-surface p-4">
              <Text className="text-base font-semibold text-ink">{report.sourceName}</Text>
              <Text className="text-base text-ink">
                {t('impact.affectedSummary', { count: report.dishes.length })}
              </Text>
              <Text className="text-base text-muted">
                {t('impact.belowSummary', { count: report.belowTargetCount })}
              </Text>
              <Text className="text-sm text-muted">
                {t('impact.channelNote')}
              </Text>
            </View>
            {report.dishes.length > 0 ? (
              report.dishes.map((dish) => {
                return (
                  <ImpactDishRow
                    key={dish.recipeId}
                    dish={dish}
                    currency={report.currency}
                    locale={report.locale}
                    onPress={() => openDish(dish.recipeId)}
                  />
                );
              })
            ) : (
              <Text className="py-6 text-center text-base text-muted">
                {t('impact.noAffectedDishes')}
              </Text>
            )}
          </ScrollView>
          <View
            className="border-t border-line bg-bg px-4 pt-3"
            style={{ paddingBottom: Math.max(12, insets.bottom) }}>
            <Button label={t('impact.done')} onPress={() => router.back()} />
          </View>
        </>
      ) : null}
    </SafeAreaView>
  );
}
