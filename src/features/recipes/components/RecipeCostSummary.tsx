import { Decimal } from 'decimal.js';
import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { formatCurrency } from '@core/costing/money';

interface RecipeCostSummaryProps {
  batchCost?: Decimal;
  costPerUnit?: Decimal;
  profitPerPortion?: Decimal;
  profitChannelName?: string;
  recipeId?: string;
  isExportingPdf?: boolean;
  pdfError?: string;
  onExportPdf?: () => void;
  isSubRecipe: boolean;
  error?: string;
  currency: string;
  locale: string;
}

export function RecipeCostSummary({
  batchCost,
  costPerUnit,
  profitPerPortion,
  profitChannelName,
  recipeId,
  isExportingPdf = false,
  pdfError,
  onExportPdf,
  isSubRecipe,
  error,
  currency,
  locale,
}: RecipeCostSummaryProps) {
  const { t } = useTranslation();

  return (
    <View className="gap-2 border-t border-line bg-surface px-4 py-3">
      {error ? (
        <Text accessibilityRole="alert" className="font-inter text-sm text-bad">
          {error}
        </Text>
      ) : batchCost && costPerUnit ? (
        <View className="flex-row items-start justify-between gap-3">
          <View className="flex-1 gap-1">
            <Text className="font-inter text-sm text-muted">{t('recipes.costPerBatch')}</Text>
            <Text className="text-base font-inter-semibold text-ink">
              {formatCurrency(batchCost, currency, locale)}
            </Text>
          </View>
          <View className="flex-1 items-end gap-1">
            <Text className="font-inter text-sm text-muted">
              {isSubRecipe ? t('recipes.costPerYieldUnit') : t('recipes.costPerPortion')}
            </Text>
            <Text className="text-base font-inter-semibold text-ink">
              {formatCurrency(costPerUnit, currency, locale)}
            </Text>
          </View>
        </View>
      ) : (
        <Text className="font-inter text-base text-muted">
          {isSubRecipe ? t('recipes.addItemsForBatchCost') : t('recipes.addItemsForCost')}
        </Text>
      )}
      {pdfError ? (
        <Text accessibilityRole="alert" className="font-inter text-sm text-bad">
          {pdfError}
        </Text>
      ) : null}
      {!isSubRecipe && profitPerPortion ? (
        <Text className="text-sm font-inter-semibold text-ink">
          {t('recipes.profitPerPortionForChannel', {
            channel: profitChannelName ?? '',
          })}
          {': '}
          {formatCurrency(profitPerPortion, currency, locale)}
        </Text>
      ) : null}
      {!isSubRecipe && recipeId ? (
        <View className="gap-2">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('pricing.openWhatIf')}
            onPress={() => router.push(`/recipe/${recipeId}/price`)}
            className="min-h-12 items-center justify-center rounded-xl border border-line bg-surface px-4">
            <Text className="text-base font-inter-semibold text-brand">
              {t('pricing.openWhatIf')}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('pricing.exportPdf')}
            disabled={isExportingPdf}
            onPress={onExportPdf}
            className={`min-h-12 items-center justify-center rounded-xl border border-line bg-surface px-4 ${
              isExportingPdf ? 'opacity-50' : ''
            }`}>
            <Text className="text-base font-inter-semibold text-brand">
              {t('pricing.exportPdf')}
            </Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}
