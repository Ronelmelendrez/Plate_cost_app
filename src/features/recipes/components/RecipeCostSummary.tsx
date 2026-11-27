import { Decimal } from 'decimal.js';
import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { formatCurrency } from '@core/costing/money';

interface RecipeCostSummaryProps {
  batchFoodCost?: Decimal;
  foodCostPerUnit?: Decimal;
  packagingCostPerUnit?: Decimal;
  totalCostPerUnit?: Decimal;
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
  batchFoodCost,
  foodCostPerUnit,
  packagingCostPerUnit,
  totalCostPerUnit,
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
      ) : batchFoodCost && foodCostPerUnit ? (
        <View className="gap-1">
          <View className="flex-row items-center justify-between">
            <Text className="font-inter text-sm text-muted">
              {t(isSubRecipe ? 'recipes.costPerBatch' : 'packaging.foodCost')}
            </Text>
            <Text className="font-inter-semibold text-ink">
              {formatCurrency(batchFoodCost, currency, locale)}
            </Text>
          </View>
          <View className="flex-row items-center justify-between">
            <Text className="font-inter text-sm text-muted">
              {t(isSubRecipe ? 'recipes.costPerYieldUnit' : 'packaging.foodCostPerPortion')}
            </Text>
            <Text className="font-inter-semibold text-ink">
              {formatCurrency(foodCostPerUnit, currency, locale)}
            </Text>
          </View>
          {!isSubRecipe && packagingCostPerUnit && totalCostPerUnit ? (
            <>
              <View className="flex-row items-center justify-between">
                <Text className="font-inter text-sm text-muted">
                  {t('packaging.packagingCostPerPortion')}
                </Text>
                <Text className="font-inter-semibold text-ink">
                  {formatCurrency(packagingCostPerUnit, currency, locale)}
                </Text>
              </View>
              <View className="flex-row items-center justify-between border-t border-line pt-1">
                <Text className="font-inter-semibold text-ink">
                  {t('recipes.costPerPortion')}
                </Text>
                <Text className="font-inter-semibold text-ink">
                  {formatCurrency(totalCostPerUnit, currency, locale)}
                </Text>
              </View>
            </>
          ) : null}
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
