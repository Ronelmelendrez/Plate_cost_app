import { Pressable, ScrollView, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { formatCurrency } from '@core/costing/money';
import type {
  PriceChangeImpactReport,
  PriceImpactDish,
} from '@features/impact/data/impactRepository';
import { BottomSheet, Button } from '@shared/ui';

interface PriceChangeImpactSheetProps {
  report: PriceChangeImpactReport;
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
      <Text className="font-inter-semibold text-base text-ink">{dish.name}</Text>
      <Text className="font-inter text-sm text-muted">
        {t('impact.dishCost', {
          cost: formatCurrency(dish.costPerPortion, currency, locale),
        })}
      </Text>
      <Text className={`font-inter-semibold text-sm ${statusColor}`}>
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
  onClose,
  onReview,
  onSelectDish,
}: PriceChangeImpactSheetProps) {
  const { t } = useTranslation();

  return (
    <BottomSheet
      title={t('impact.title')}
      subtitle={report.sourceName}
      closeLabel={t('impact.close')}
      onClose={onClose}>
      <View className="px-4 pb-4 pt-3">
        <Text className="font-inter-semibold text-base text-ink">
          {t('impact.affectedSummary', { count: report.dishes.length })}
        </Text>
        <Text className="mb-2 font-inter text-base text-muted">
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
            <Text className="py-2 font-inter text-sm text-muted">
              {t('impact.moreDishes', { count: report.dishes.length - 3 })}
            </Text>
          ) : null}
        </ScrollView>
        <Button label={t('impact.review')} onPress={onReview} />
      </View>
    </BottomSheet>
  );
}
