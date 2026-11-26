import { Pressable, ScrollView, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { formatCurrency } from '@core/costing/money';
import type {
  PriceChangeImpactReport,
  PriceImpactDish,
} from '@features/impact/data/impactRepository';
import { Button } from '@shared/ui';

interface PriceChangeImpactSheetProps {
  report: PriceChangeImpactReport;
  bottomInset: number;
  onClose: () => void;
  onReview: () => void;
  onSelectDish: (recipeId: string) => void;
}

export function ImpactDishRow({
  dish,
  currency,
  locale,
  onPress,
}: {
  dish: PriceImpactDish;
  currency: string;
  locale: string;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const statusLabel =
    dish.status === 'unpriced'
      ? t('impact.noPrice')
      : t(`dashboard.status.${dish.status}`);
  const statusColor =
    dish.status === 'good'
      ? 'text-good'
      : dish.status === 'close'
        ? 'text-warn'
        : dish.status === 'low'
          ? 'text-bad'
          : 'text-muted';
  const margin = dish.marginPct
    ? new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(
        dish.marginPct.toNumber(),
      )
    : undefined;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        margin
          ? t('impact.dishSummary', {
              name: dish.name,
              cost: formatCurrency(dish.costPerPortion, currency, locale),
              channel: dish.channelName,
              margin,
              status: statusLabel,
            })
          : t('impact.unpricedDishSummary', {
              name: dish.name,
              cost: formatCurrency(dish.costPerPortion, currency, locale),
            })
      }
      onPress={onPress}
      className="gap-1 border-b border-line py-3">
      <Text className="text-base font-semibold text-ink">{dish.name}</Text>
      <Text className="text-sm text-muted">
        {t('impact.dishCost', {
          cost: formatCurrency(dish.costPerPortion, currency, locale),
        })}
      </Text>
      <Text className={`text-sm font-semibold ${statusColor}`}>
        {dish.status === 'low' ? '↓ ' : dish.status === 'good' ? '↑ ' : '• '}
        {margin
          ? t('impact.channelMargin', {
              channel: dish.channelName,
              margin,
              status: statusLabel,
            })
          : statusLabel}
      </Text>
    </Pressable>
  );
}

export function PriceChangeImpactSheet({
  report,
  bottomInset,
  onClose,
  onReview,
  onSelectDish,
}: PriceChangeImpactSheetProps) {
  const { t } = useTranslation();

  return (
    <View
      className="absolute inset-0 justify-end"
      pointerEvents="box-none"
      style={{ zIndex: 50, elevation: 50 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('impact.close')}
        onPress={onClose}
        className="absolute inset-0"
        style={{ backgroundColor: 'rgba(0, 0, 0, 0.38)' }}
      />
      <View
        className="rounded-t-3xl border-t border-line bg-surface px-4 pt-5"
        style={{ maxHeight: '80%', paddingBottom: Math.max(16, bottomInset) }}>
        <View className="mb-3 flex-row items-start justify-between gap-3">
          <View className="flex-1 gap-1">
            <Text className="text-xl font-semibold text-ink">{t('impact.title')}</Text>
            <Text className="text-sm text-muted">{report.sourceName}</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('impact.close')}
            onPress={onClose}
            className="min-h-12 min-w-12 items-center justify-center">
            <Text className="text-base font-semibold text-brand">{t('impact.close')}</Text>
          </Pressable>
        </View>
        <Text className="text-base font-semibold text-ink">
          {t('impact.affectedSummary', { count: report.dishes.length })}
        </Text>
        <Text className="mb-2 text-base text-muted">
          {t('impact.belowSummary', { count: report.belowTargetCount })}
        </Text>
        <ScrollView
          className="mb-3"
          keyboardShouldPersistTaps="handled"
          nestedScrollEnabled>
          {report.dishes.slice(0, 3).map((dish) => (
            <ImpactDishRow
              key={dish.recipeId}
              dish={dish}
              currency={report.currency}
              locale={report.locale}
              onPress={() => onSelectDish(dish.recipeId)}
            />
          ))}
          {report.dishes.length > 3 ? (
            <Text className="py-2 text-sm text-muted">
              {t('impact.moreDishes', { count: report.dishes.length - 3 })}
            </Text>
          ) : null}
        </ScrollView>
        <Button label={t('impact.review')} onPress={onReview} />
      </View>
    </View>
  );
}
