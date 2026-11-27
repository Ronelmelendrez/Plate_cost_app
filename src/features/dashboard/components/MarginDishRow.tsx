import { SymbolView } from 'expo-symbols';
import type { ComponentProps } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { formatCurrency } from '@core/costing/money';
import type { MarginDashboardRow, MarginStatus } from '@features/dashboard/domain/marginDashboard';
import { Colors } from '@shared/theme';

const statusStyles = {
  good: {
    color: Colors.light.good,
    soft: Colors.light.goodSoft,
    icon: { ios: 'checkmark.circle.fill', android: 'check_circle', web: 'check_circle' },
    label: 'good',
  },
  close: {
    color: Colors.light.warn,
    soft: Colors.light.warnSoft,
    icon: { ios: 'minus.circle.fill', android: 'remove_circle', web: 'remove_circle' },
    label: 'close',
  },
  low: {
    color: Colors.light.bad,
    soft: Colors.light.badSoft,
    icon: { ios: 'arrow.down.circle.fill', android: 'arrow_downward', web: 'arrow_downward' },
    label: 'low',
  },
} satisfies Record<
  MarginStatus,
  {
    color: string;
    soft: string;
    icon: ComponentProps<typeof SymbolView>['name'];
    label: string;
  }
>;

function formatMargin(value: number, locale: string) {
  return new Intl.NumberFormat(locale, {
    style: 'percent',
    maximumFractionDigits: 0,
  }).format(value / 100);
}

export function MarginDishRow({
  row,
  status,
  currency,
  locale,
  onPress,
}: {
  row: MarginDashboardRow;
  status?: MarginStatus;
  currency: string;
  locale: string;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const styles = status ? statusStyles[status] : undefined;
  const margin = row.marginPct ? formatMargin(row.marginPct.toNumber(), locale) : undefined;
  const price = row.price ? formatCurrency(row.price, currency, locale) : undefined;
  const cost = formatCurrency(row.cost, currency, locale);
  const profit = row.profit ? formatCurrency(row.profit, currency, locale) : undefined;

  const stats = [
    { label: t('dashboard.priceLabel'), value: price ?? '—' },
    { label: t('dashboard.costLabel'), value: cost },
    { label: t('dashboard.profitLabel'), value: profit ?? '—' },
  ];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('dashboard.dishSummary', {
        name: row.name,
        price: price ?? t('dashboard.notSoldHere'),
        cost,
        profit: profit ?? t('dashboard.notSoldHere'),
        margin: margin ?? t('dashboard.notSoldHere'),
        status: styles ? t(`dashboard.status.${styles.label}`) : t('dashboard.notSoldHere'),
      })}
      onPress={onPress}
      className="mb-3 rounded-3xl border border-line bg-surface p-4 shadow-sm">
      <View className="flex-row items-start gap-3">
        <View className="min-w-0 flex-1 gap-1.5 pr-1">
          <Text className="font-inter-bold text-[16px] leading-[22px] text-ink">{row.name}</Text>
          <View className="flex-row items-center gap-1.5">
            <View
              className="h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: styles ? styles.color : Colors.light.tabIconDefault }}
            />
            <Text
              numberOfLines={1}
              className="shrink font-inter-semibold text-[11px] uppercase tracking-[0.6px]"
              style={{ color: styles ? styles.color : Colors.light.tabIconDefault }}>
              {styles ? t(`dashboard.status.${styles.label}`) : t('dashboard.notSoldHere')}
            </Text>
          </View>
        </View>

        <View
          className="shrink-0 items-center rounded-2xl px-3 py-2"
          style={{ backgroundColor: styles ? styles.soft : Colors.light.background }}>
          <Text
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.6}
            className="font-inter-extrabold text-[18px] leading-[22px]"
            style={{ color: styles ? styles.color : Colors.light.tabIconDefault }}>
            {margin ?? '—'}
          </Text>
          <Text
            numberOfLines={1}
            className="mt-0.5 font-inter-semibold text-[10px] uppercase tracking-[0.5px] text-muted">
            {t('dashboard.marginLabel')}
          </Text>
        </View>
      </View>

      <View className="mt-3 flex-row rounded-2xl border border-line bg-bg">
        {stats.map((stat, index) => (
          <View
            key={stat.label}
            className={`min-w-0 flex-1 items-center gap-0.5 px-1 py-2.5 ${
              index > 0 ? 'border-l border-line' : ''
            }`}>
            <Text
              numberOfLines={1}
              className="font-inter-semibold text-[10px] uppercase tracking-[0.6px] text-muted">
              {stat.label}
            </Text>
            <Text
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.6}
              className="font-inter-semibold text-[13px] text-ink">
              {stat.value}
            </Text>
          </View>
        ))}
      </View>
    </Pressable>
  );
}
