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
  notice?: string;
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
  notice,
  currency,
  locale,
}: RecipeCostSummaryProps) {
  const { t } = useTranslation();

  return (
    <View className="gap-3 rounded-2xl border border-line bg-surface p-4">
      <Text className="font-inter-semibold text-base text-ink">
        {t('recipes.costSummary')}
      </Text>
      {error ? (
        <Text accessibilityRole="alert" className="font-inter text-sm text-bad">
          {error}
        </Text>
      ) : batchFoodCost && foodCostPerUnit ? (
        <View className="gap-1">
          <View className="flex-row items-center justify-between gap-3">
            <Text className="min-w-0 flex-1 font-inter text-sm text-muted">
              {t(isSubRecipe ? 'recipes.costPerBatch' : 'packaging.foodCost')}
            </Text>
            <Text className="shrink-0 text-right font-inter-semibold text-ink">
              {formatCurrency(batchFoodCost, currency, locale)}
            </Text>
          </View>
          <View className="flex-row items-center justify-between gap-3">
            <Text className="min-w-0 flex-1 font-inter text-sm text-muted">
              {t(isSubRecipe ? 'recipes.costPerYieldUnit' : 'packaging.foodCostPerPortion')}
            </Text>
            <Text className="shrink-0 text-right font-inter-semibold text-ink">
              {formatCurrency(foodCostPerUnit, currency, locale)}
            </Text>
          </View>
          {!isSubRecipe && packagingCostPerUnit && totalCostPerUnit ? (
            <>
              <View className="flex-row items-center justify-between gap-3">
                <Text className="min-w-0 flex-1 font-inter text-sm text-muted">
                  {t('packaging.packagingCostPerPortion')}
                </Text>
                <Text className="shrink-0 text-right font-inter-semibold text-ink">
                  {formatCurrency(packagingCostPerUnit, currency, locale)}
                </Text>
              </View>
              <View className="flex-row items-center justify-between gap-3 border-t border-line pt-1">
                <Text className="min-w-0 flex-1 font-inter-semibold text-ink">
                  {t('recipes.costPerPortion')}
                </Text>
                <Text className="shrink-0 text-right font-inter-semibold text-ink">
                  {formatCurrency(totalCostPerUnit, currency, locale)}
                </Text>
              </View>
            </>
          ) : null}
        </View>
      ) : (
        <View className="items-center justify-center rounded-xl border border-dashed border-line bg-bg px-4 py-3">
          <Text className="text-center font-inter text-sm leading-5 text-muted">
            {isSubRecipe ? t('recipes.addItemsForBatchCost') : t('recipes.addItemsForCost')}
          </Text>
        </View>
      )}
      {notice ? (
        <Text className="font-inter text-sm leading-5 text-muted">{notice}</Text>
      ) : null}
      {pdfError ? (
        <Text accessibilityRole="alert" className="font-inter text-sm text-bad">
          {pdfError}
        </Text>
      ) : null}
      {!isSubRecipe && profitPerPortion ? (
        <View className="flex-row items-center justify-between gap-3 border-t border-line pt-1">
          <Text className="min-w-0 flex-1 font-inter-semibold text-sm text-ink">
            {t('recipes.profitPerPortionForChannel', {
              channel: profitChannelName ?? '',
            })}
          </Text>
          <Text className="shrink-0 text-right font-inter-semibold text-ink">
            {formatCurrency(profitPerPortion, currency, locale)}
          </Text>
        </View>
      ) : null}
      {!isSubRecipe && recipeId ? (
        <View className="flex-row gap-2">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('pricing.openWhatIf')}
            onPress={() => router.push(`/recipe/${recipeId}/price`)}
            className="min-h-12 min-w-0 flex-1 items-center justify-center rounded-xl border border-line bg-surface px-3">
            <Text className="text-center text-sm font-inter-semibold text-brand">
              {t('pricing.openWhatIf')}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('pricing.exportPdf')}
            disabled={isExportingPdf}
            onPress={onExportPdf}
            className={`min-h-12 min-w-0 flex-1 items-center justify-center rounded-xl border border-line bg-surface px-3 ${
              isExportingPdf ? 'opacity-50' : ''
            }`}>
            <Text className="text-center text-sm font-inter-semibold text-brand">
              {t('pricing.exportPdf')}
            </Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}
