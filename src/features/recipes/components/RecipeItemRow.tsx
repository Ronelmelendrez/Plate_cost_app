import { Decimal } from 'decimal.js';
import { Pressable, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { formatCurrency } from '@core/costing/money';
import type { RecipeItemDraft } from '@features/recipes/data/recipeRepository';
interface RecipeItemRowProps {
  item: RecipeItemDraft;
  name: string;
  lineCost?: Decimal;
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
  isSubRecipe,
  currency,
  locale,
  onPress,
  onRemove,
}: RecipeItemRowProps) {
  const { t } = useTranslation();
  const kindLabel = t(`recipes.${item.kind}Item`);

  return (
    <View className="min-h-16 flex-row items-center border-b border-line py-2">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('recipes.itemSummary', {
          name,
          quantity: item.quantity,
          unit: t(`units.${item.unit}`),
          basis: t(isSubRecipe ? 'recipes.batchItemCostBasis' : 'recipes.itemCostBasis'),
          cost: lineCost
            ? formatCurrency(lineCost, currency, locale)
            : t('recipes.costUnavailable'),
        })}
        onPress={onPress}
        className="min-h-12 flex-1 flex-row items-center justify-between">
        <View className="flex-1 gap-1">
          <Text className="text-base font-semibold text-ink">{name}</Text>
          <Text className="text-sm text-muted">
            {kindLabel} · {item.quantity} {t(`units.${item.unit}`)}
          </Text>
        </View>
        <Text className="ms-2 text-base font-semibold text-ink">
          {lineCost
            ? formatCurrency(lineCost, currency, locale)
            : t('recipes.costUnavailable')}
        </Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('recipes.removeItem', { name })}
        onPress={onRemove}
        className="ms-2 min-h-12 min-w-12 items-center justify-center">
        <Text className="text-sm font-semibold text-muted">{t('recipes.remove')}</Text>
      </Pressable>
    </View>
  );
}
