import { Decimal } from 'decimal.js';
import { Pressable, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useState } from 'react';

import type { CostBreakdownLine } from '@core/costing/costEngine';
import { formatCurrency, formatDecimalInput } from '@core/costing/money';
import type { RecipeItemDraft } from '@features/recipes/data/recipeRepository';
interface RecipeItemRowProps {
  item: RecipeItemDraft;
  name: string;
  lineCost?: Decimal;
  subRecipeCalculation?: CostBreakdownLine['subRecipeCalculation'];
  isSubRecipe: boolean;
  currency: string;
  locale: string;
  onPress: () => void;
  onRemove: () => void;
}

export function RecipeItemRow({
  item,
  name,
  lineCost,
  subRecipeCalculation,
  isSubRecipe,
  currency,
  locale,
  onPress,
  onRemove,
}: RecipeItemRowProps) {
  const { t } = useTranslation();
  const kindLabel = t(`recipes.${item.kind}Item`);
  const [isCalculationExpanded, setIsCalculationExpanded] = useState(false);
  const costBasis = t(
    isSubRecipe ? 'recipes.batchItemCostBasis' : 'recipes.itemCostBasis',
  );

  return (
    <View className="min-h-16 flex-row items-center border-b border-line py-2">
      <View className="min-w-0 flex-1">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('recipes.itemSummary', {
            name,
            quantity: item.quantity,
            unit: t(`units.${item.unit}`),
            basis: costBasis,
            cost: lineCost
              ? formatCurrency(lineCost, currency, locale)
              : t('recipes.costUnavailable'),
          })}
          onPress={onPress}
          className="min-h-12 flex-row items-center justify-between">
          <View className="min-w-0 flex-1 gap-1">
            <Text className="text-base font-inter-semibold text-ink">{name}</Text>
            <Text className="font-inter text-sm text-muted">
              {kindLabel} · {item.quantity} {t(`units.${item.unit}`)}
            </Text>
          </View>
          <Text className="ms-2 shrink-0 text-right text-base font-inter-semibold text-ink">
            {lineCost
              ? formatCurrency(lineCost, currency, locale)
              : t('recipes.costUnavailable')}
          </Text>
        </Pressable>
        {subRecipeCalculation ? (
          <>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded: isCalculationExpanded }}
              accessibilityLabel={t(
                isCalculationExpanded
                  ? 'recipes.hideCalculationFor'
                  : 'recipes.showCalculationFor',
                { name },
              )}
              onPress={() => setIsCalculationExpanded((current) => !current)}
              className="min-h-12 self-start justify-center pe-2">
              <Text className="font-inter-semibold text-sm text-brand">
                {t(
                  isCalculationExpanded
                    ? 'recipes.hideCalculation'
                    : 'recipes.showCalculation',
                )}
              </Text>
            </Pressable>
            {isCalculationExpanded ? (
              <View className="mb-2 gap-1 rounded-xl bg-bg p-3">
                <Text className="font-inter text-sm leading-5 text-ink">
                  {t('recipes.subRecipeCostCalculation', {
                    quantity: formatDecimalInput(item.quantity, locale),
                    unit: t(`units.${item.unit}`),
                    baseQuantity: formatDecimalInput(
                      subRecipeCalculation.quantity.toString(),
                      locale,
                    ),
                    baseUnit: t(`units.${subRecipeCalculation.unit}`),
                    unitCost: formatCurrency(
                      subRecipeCalculation.costPerBaseUnit,
                      currency,
                      locale,
                    ),
                    cost: formatCurrency(
                      subRecipeCalculation.lineCost,
                      currency,
                      locale,
                    ),
                  })}
                </Text>
                <Text className="font-inter text-sm leading-5 text-muted">
                  {t('recipes.finalSubRecipeLineCost', {
                    basis: costBasis,
                    cost: lineCost
                      ? formatCurrency(lineCost, currency, locale)
                      : t('recipes.costUnavailable'),
                  })}
                </Text>
              </View>
            ) : null}
          </>
        ) : null}
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('recipes.removeItem', { name })}
        onPress={onRemove}
        className="ms-2 min-h-12 min-w-12 items-center justify-center">
        <Text className="text-sm font-inter-semibold text-muted">{t('recipes.remove')}</Text>
      </Pressable>
    </View>
  );
}
