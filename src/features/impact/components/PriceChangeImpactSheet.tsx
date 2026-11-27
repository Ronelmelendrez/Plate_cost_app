import { SymbolView } from 'expo-symbols';
import type { ComponentProps } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { formatCurrency } from '@core/costing/money';
import type {
  PriceChangeImpactReport,
  PriceImpactDish,
} from '@features/impact/data/impactRepository';
import { BottomSheet, Button } from '@shared/ui';
import { Colors } from '@shared/theme';

interface PriceChangeImpactSheetProps {
  report: PriceChangeImpactReport;
  onClose: () => void;
  onReview: () => void;
  onSelectDish: (recipeId: string) => void;
}

const impactStatusStyles = {
  good: {
    color: Colors.light.good,
    soft: Colors.light.goodSoft,
    icon: { ios: 'checkmark.circle.fill', android: 'check_circle', web: 'check_circle' },
  },
  close: {
    color: Colors.light.warn,
    soft: Colors.light.warnSoft,
    icon: { ios: 'minus.circle.fill', android: 'remove_circle', web: 'remove_circle' },
  },
  low: {
    color: Colors.light.bad,
    soft: Colors.light.badSoft,
    icon: { ios: 'arrow.down.circle.fill', android: 'arrow_downward', web: 'arrow_downward' },
  },
  unpriced: {
    color: Colors.light.tabIconDefault,
    soft: Colors.light.background,
    icon: { ios: 'info.circle.fill', android: 'info', web: 'info' },
  },
} satisfies Record<
  PriceImpactDish['status'],
  { color: string; soft: string; icon: ComponentProps<typeof SymbolView>['name'] }
>;

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
  const statusStyle = impactStatusStyles[dish.status];
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
      className="mb-3 flex-row items-center justify-between gap-3 rounded-3xl border border-line bg-surface p-4 shadow-sm">
      <View className="min-w-0 flex-1 gap-1.5">
        <Text className="font-inter-bold text-[16px] leading-[22px] text-ink">{dish.name}</Text>
        <Text className="font-inter text-[13px] leading-[18px] text-muted">
          {t('impact.dishCost', {
            cost: formatCurrency(dish.costPerPortion, currency, locale),
          })}
        </Text>
        <View className="flex-row items-center gap-1.5">
          <SymbolView name={statusStyle.icon} tintColor={statusStyle.color} size={16} />
          <Text
            className="flex-1 font-inter-semibold text-[12px] leading-[17px]"
            style={{ color: statusStyle.color }}>
            {margin
              ? t('impact.channelMargin', {
                  channel: dish.channelName,
                  margin,
                  status: statusLabel,
                })
              : statusLabel}
          </Text>
        </View>
      </View>
      <View
        className="shrink-0 items-center rounded-2xl px-3 py-2"
        style={{ backgroundColor: statusStyle.soft }}>
        <Text
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.6}
          className="font-inter-extrabold text-[18px] leading-[22px]"
          style={{ color: statusStyle.color }}>
          {margin ? `${margin}%` : '—'}
        </Text>
        <Text className="mt-0.5 font-inter-semibold text-[10px] uppercase tracking-[0.5px] text-muted">
          {t('dashboard.marginLabel')}
        </Text>
      </View>
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
