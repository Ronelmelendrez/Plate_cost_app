import { Decimal } from 'decimal.js';
import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { formatCurrency } from '@core/costing/money';

interface RecipeCostSummaryProps {
  batchCost?: Decimal;
  costPerUnit?: Decimal;
  profitPerPortion?: Decimal;
  isSubRecipe: boolean;
  error?: string;
  currency: string;
  locale: string;
}

export function RecipeCostSummary({
  batchCost,
  costPerUnit,
  profitPerPortion,
  isSubRecipe,
  error,
  currency,
  locale,
}: RecipeCostSummaryProps) {
  const { t } = useTranslation();

  return (
    <View className="gap-2 border-t border-line bg-surface px-4 py-3">
      {error ? (
        <Text accessibilityRole="alert" className="text-sm text-bad">
          {error}
        </Text>
      ) : batchCost && costPerUnit ? (
        <View className="flex-row items-start justify-between gap-3">
          <View className="flex-1 gap-1">
            <Text className="text-sm text-muted">{t('recipes.costPerBatch')}</Text>
            <Text className="text-base font-semibold text-ink">
              {formatCurrency(batchCost, currency, locale)}
            </Text>
          </View>
          <View className="flex-1 items-end gap-1">
            <Text className="text-sm text-muted">
              {isSubRecipe ? t('recipes.costPerYieldUnit') : t('recipes.costPerPortion')}
            </Text>
            <Text className="text-base font-semibold text-ink">
              {formatCurrency(costPerUnit, currency, locale)}
            </Text>
          </View>
        </View>
      ) : (
        <Text className="text-base text-muted">
          {isSubRecipe ? t('recipes.addItemsForBatchCost') : t('recipes.addItemsForCost')}
        </Text>
      )}
      {!isSubRecipe && profitPerPortion ? (
        <Text className="text-sm font-semibold text-ink">
          {t('recipes.profitPerPortion')}: {formatCurrency(profitPerPortion, currency, locale)}
        </Text>
      ) : null}
    </View>
  );
}
