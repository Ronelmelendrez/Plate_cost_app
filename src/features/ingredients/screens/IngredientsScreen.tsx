import { Decimal } from 'decimal.js';
import { getLocales } from 'expo-localization';
import { router, useFocusEffect } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Pressable, Text, TextInput, View } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';

import { createDrizzleClient } from '@core/db/client';
import { costPerUsableBaseUnit, UNIT_BASE } from '@core/costing/units';
import { currencyFractionDigits, formatCurrency } from '@core/costing/money';
import {
  listIngredients,
  markIngredientRecent,
  setIngredientFavourite,
  type Ingredient,
} from '@features/ingredients/data/ingredientRepository';
import { getAppSettings, type AppSettings } from '@features/settings';
import { Button } from '@shared/ui';
import { Colors } from '@shared/theme';

const localeInfo = getLocales()[0];
const deviceLocale = localeInfo?.languageTag ?? 'en-US';
const deviceCurrency = localeInfo?.currencyCode ?? 'USD';

function IngredientRow({
  ingredient,
  currency,
  locale,
  onPress,
  onToggleFavourite,
}: {
  ingredient: Ingredient;
  currency: string;
  locale: string;
  onPress: () => void;
  onToggleFavourite: () => void;
}) {
  const { t } = useTranslation();
  const fractionDigits = currencyFractionDigits(currency, locale);
  const costPerUnit = costPerUsableBaseUnit({
    priceMinor: ingredient.purchasePriceMinor,
    fractionDigits,
    purchaseQuantity: ingredient.purchaseQuantity,
    purchaseUnit: ingredient.purchaseUnit,
    usableYieldPct: ingredient.usableYieldPct,
  });
  const purchasePrice = new Decimal(ingredient.purchasePriceMinor).div(
    new Decimal(10).pow(fractionDigits),
  );
  const baseUnit = UNIT_BASE[ingredient.purchaseUnit];
  const price = formatCurrency(purchasePrice, currency, locale);
  const unitCost = formatCurrency(costPerUnit, currency, locale);
  const quantityAndUnit = `${ingredient.purchaseQuantity} ${t(`units.${ingredient.purchaseUnit}`)}`;
  const accessibleName = t('ingredients.ingredientDetail', {
    name: ingredient.name,
    quantity: ingredient.purchaseQuantity,
    unit: t(`units.${ingredient.purchaseUnit}`),
    price,
    cost: unitCost,
    baseUnit: t(`units.${baseUnit}`),
    yield: ingredient.usableYieldPct,
  });

  return (
    <View className="min-h-20 flex-row items-center border-b border-line py-3">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibleName}
        onPress={onPress}
        className="min-h-14 flex-1 flex-row items-center">
        <View className="flex-1 gap-1">
          <Text className="text-base font-semibold text-ink">{ingredient.name}</Text>
          <Text className="text-sm text-muted">
            {t('ingredients.costPerUsableUnit', {
              unit: t(`units.${baseUnit}`),
            })}
            {': '}
            {unitCost}
          </Text>
        </View>
        <View className="ms-2 items-end gap-1">
          <Text className="text-base font-semibold text-ink">{price}</Text>
          <Text className="text-sm text-muted">{quantityAndUnit}</Text>
        </View>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          ingredient.isFavourite ? t('ingredients.removeFavourite') : t('ingredients.addFavourite')
        }
        onPress={onToggleFavourite}
        className="ms-2 min-h-12 min-w-12 items-center justify-center">
        <SymbolView
          name={
            ingredient.isFavourite
              ? { ios: 'heart.fill', android: 'favorite', web: 'favorite' }
              : { ios: 'heart', android: 'favorite_border', web: 'favorite_border' }
          }
          tintColor={
            ingredient.isFavourite ? Colors.light.tint : Colors.light.tabIconDefault
          }
          size={22}
        />
      </Pressable>
    </View>
  );
}

export default function IngredientsScreen() {
  const sqlite = useSQLiteContext();
  const database = useMemo(() => createDrizzleClient(sqlite), [sqlite]);
  const { t } = useTranslation();
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [appSettings, setAppSettings] = useState<AppSettings | null>(null);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  const loadIngredients = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      setAppSettings(await getAppSettings(database));
      setIngredients(await listIngredients(database, search));
    } catch (loadError) {
      console.error('Unable to load ingredients.', loadError);
      setError(t('ingredients.loadError'));
    } finally {
      setIsLoading(false);
    }
  }, [database, search, t]);

  const currency = appSettings?.currencyCode ?? deviceCurrency;
  const locale = appSettings?.locale ?? deviceLocale;

  useFocusEffect(
    useCallback(() => {
      void loadIngredients();
    }, [loadIngredients]),
  );

  const openIngredient = async (ingredient: Ingredient) => {
    try {
      await markIngredientRecent(database, ingredient.id);
    } catch (updateError) {
      console.error('Unable to update recent ingredient.', updateError);
      setError(t('ingredients.updateError'));
    }
    router.push(`/ingredient/${ingredient.id}`);
  };

  const toggleFavourite = async (ingredient: Ingredient) => {
    try {
      await setIngredientFavourite(database, ingredient.id, !ingredient.isFavourite);
      await loadIngredients();
    } catch (updateError) {
      console.error('Unable to update ingredient favourite.', updateError);
      setError(t('ingredients.updateError'));
    }
  };

  return (
    <View className="flex-1 bg-bg px-4 pt-4">
      <Text className="mb-4 text-xl font-semibold text-ink">{t('ingredients.title')}</Text>
      <View className="mb-3 min-h-12 flex-row items-center rounded-xl border border-line bg-surface px-3">
        <TextInput
          accessibilityLabel={t('ingredients.search')}
          value={search}
          onChangeText={setSearch}
          placeholder={t('ingredients.search')}
          placeholderTextColor={Colors.light.tabIconDefault}
          returnKeyType="search"
          className="min-h-12 flex-1 p-0 text-base text-ink"
        />
      </View>
      {error ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('ingredients.retry')}
          onPress={() => void loadIngredients()}
          className="mb-3 min-h-12 justify-center">
          <Text accessibilityRole="alert" className="text-base text-bad">
            {error} {t('ingredients.retry')}
          </Text>
        </Pressable>
      ) : null}
      <FlatList
        data={ingredients}
        keyExtractor={(item) => item.id}
        keyboardShouldPersistTaps="handled"
        contentContainerClassName="flex-grow"
        renderItem={({ item }) => (
          <IngredientRow
            ingredient={item}
            currency={currency}
            locale={locale}
            onPress={() => void openIngredient(item)}
            onToggleFavourite={() => void toggleFavourite(item)}
          />
        )}
        ListEmptyComponent={
          isLoading ? undefined : (
            <View className="flex-1 items-center justify-center px-4 py-10">
              <Text className="mb-2 text-base font-semibold text-ink">
                {search ? t('ingredients.noResults') : t('ingredients.emptyTitle')}
              </Text>
              {!search ? (
                <Text className="text-center text-base leading-6 text-muted">
                  {t('ingredients.emptyBody')}
                </Text>
              ) : null}
            </View>
          )
        }
        className="flex-1"
      />
      <View className="pb-3 pt-2">
        <Button
          label={t('ingredients.addIngredient')}
          onPress={() => router.push('/ingredient/new')}
        />
      </View>
    </View>
  );
}
