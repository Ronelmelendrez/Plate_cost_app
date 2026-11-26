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
    icon: { ios: 'checkmark.circle.fill', android: 'check_circle', web: 'check_circle' },
    label: 'good',
  },
  close: {
    color: Colors.light.warn,
    icon: { ios: 'minus.circle.fill', android: 'remove_circle', web: 'remove_circle' },
    label: 'close',
  },
  low: {
    color: Colors.light.bad,
    icon: { ios: 'arrow.down.circle.fill', android: 'arrow_downward', web: 'arrow_downward' },
    label: 'low',
  },
} satisfies Record<
  MarginStatus,
  { color: string; icon: ComponentProps<typeof SymbolView>['name']; label: string }
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
      className="mb-3 min-h-20 rounded-xl border border-line bg-surface p-4">
      <View className="flex-row items-start justify-between gap-3">
        <Text className="flex-1 text-lg font-semibold text-ink">{row.name}</Text>
        {styles && margin ? (
          <View className="flex-row items-center gap-1 rounded-full bg-bg px-3 py-2">
            <SymbolView
              name={styles.icon}
              tintColor={styles.color}
              size={18}
            />
            <Text style={{ color: styles.color }} className="text-xs font-semibold">
              {t(`dashboard.status.${styles.label}`)}
            </Text>
            <Text className="ms-1 text-base font-bold text-ink">{margin}</Text>
          </View>
        ) : (
          <Text className="text-sm text-muted">{t('dashboard.notSoldHere')}</Text>
        )}
      </View>
      <Text className="mt-3 border-t border-line pt-3 text-sm leading-5 text-muted">
        {price && profit
          ? t('dashboard.priceCostProfit', { price, cost, profit })
          : t('dashboard.unpricedDishCost', { cost })}
      </Text>
    </Pressable>
  );
}
