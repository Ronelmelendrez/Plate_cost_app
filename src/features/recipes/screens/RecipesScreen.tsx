import { Decimal } from 'decimal.js';
import { getLocales } from 'expo-localization';
import { router, useFocusEffect } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Pressable, Text, TextInput, View } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';

import { createDrizzleClient } from '@core/db/client';
import { currencyFractionDigits, formatCurrency } from '@core/costing/money';
import {
  listRecipeSummaries,
  type RecipeSummary,
} from '@features/recipes/data/recipeRepository';
import { getAppSettings, type AppSettings } from '@features/settings';
import { Button } from '@shared/ui';
import { Colors } from '@shared/theme';

const localeInfo = getLocales()[0];
const deviceLocale = localeInfo?.languageTag ?? 'en-US';
const deviceCurrency = localeInfo?.currencyCode ?? 'USD';

function RecipeRow({
  summary,
  currency,
  locale,
  onPress,
}: {
  summary: RecipeSummary;
  currency: string;
  locale: string;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const cost = formatCurrency(new Decimal(summary.costPerUnit), currency, locale);
  const accessibilityLabel = t('recipes.recipeSummary', {
    name: summary.recipe.name,
    type: summary.recipe.isSubRecipe ? t('recipes.subRecipeType') : t('recipes.dishType'),
    cost,
    count: summary.itemCount,
  });

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      className="min-h-20 flex-row items-center border-b border-line py-3">
      <View className="flex-1 gap-1">
        <Text className="text-base font-semibold text-ink">{summary.recipe.name}</Text>
        <Text className="text-sm text-muted">
          {summary.recipe.isSubRecipe ? t('recipes.subRecipeType') : t('recipes.dishType')}
          {' · '}
          {t('recipes.itemsCount', { count: summary.itemCount })}
        </Text>
      </View>
      <View className="ms-3 items-end">
        <Text className="text-base font-semibold text-ink">{cost}</Text>
        <Text className="text-sm text-muted">
          {summary.recipe.isSubRecipe
            ? t('recipes.costPerYieldUnit')
            : t('recipes.costPerPortion')}
        </Text>
      </View>
      <SymbolView
        name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }}
        tintColor={Colors.light.tabIconDefault}
        size={20}
      />
    </Pressable>
  );
}

export default function RecipesScreen() {
  const sqlite = useSQLiteContext();
  const database = useMemo(() => createDrizzleClient(sqlite), [sqlite]);
  const { t } = useTranslation();
  const [appSettings, setAppSettings] = useState<AppSettings | null>(null);
  const [summaries, setSummaries] = useState<RecipeSummary[]>([]);
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  const loadRecipes = useCallback(async () => {
    setError('');
    setIsLoading(true);
    try {
      const currentSettings = await getAppSettings(database);
      setAppSettings(currentSettings);
      setSummaries(
        await listRecipeSummaries(
          database,
          currencyFractionDigits(currentSettings.currencyCode, currentSettings.locale),
        ),
      );
    } catch (loadError) {
      console.error('Unable to load recipes.', loadError);
      setError(t('recipes.loadError'));
    } finally {
      setIsLoading(false);
    }
  }, [database, t]);

  useFocusEffect(
    useCallback(() => {
      void loadRecipes();
    }, [loadRecipes]),
  );

  const visibleRecipes = summaries.filter((summary) =>
    summary.recipe.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
  );
  const currency = appSettings?.currencyCode ?? deviceCurrency;
  const locale = appSettings?.locale ?? deviceLocale;

  const openNewRecipe = (type: 'dish' | 'sub-recipe') => {
    router.push({ pathname: '/recipe/[id]', params: { id: 'new', type } });
  };

  return (
    <View className="flex-1 bg-bg px-4 pt-4">
      <Text className="mb-4 text-xl font-semibold text-ink">{t('recipes.title')}</Text>
      <View className="mb-3 min-h-12 flex-row items-center rounded-xl border border-line bg-surface px-3">
        <TextInput
          accessibilityLabel={t('recipes.search')}
          value={query}
          onChangeText={setQuery}
          placeholder={t('recipes.search')}
          placeholderTextColor={Colors.light.tabIconDefault}
          returnKeyType="search"
          className="min-h-12 flex-1 p-0 text-base text-ink"
        />
      </View>
      {error ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('recipes.retry')}
          onPress={() => void loadRecipes()}
          className="mb-3 min-h-12 justify-center">
          <Text accessibilityRole="alert" className="text-base text-bad">
            {error} {t('recipes.retry')}
          </Text>
        </Pressable>
      ) : null}
      <FlatList
        data={visibleRecipes}
        keyExtractor={(item) => item.recipe.id}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => (
          <RecipeRow
            summary={item}
            currency={currency}
            locale={locale}
            onPress={() => router.push(`/recipe/${item.recipe.id}`)}
          />
        )}
        ListEmptyComponent={
          isLoading ? undefined : (
            <View className="flex-1 items-center justify-center px-4 py-10">
              <Text className="mb-2 text-base font-semibold text-ink">
                {query ? t('recipes.noResults') : t('recipes.emptyTitle')}
              </Text>
              {!query ? (
                <Text className="text-center text-base leading-6 text-muted">
                  {t('recipes.emptyBody')}
                </Text>
              ) : null}
            </View>
          )
        }
        contentContainerClassName="flex-grow"
        className="flex-1"
      />
      <View className="gap-2 pb-3 pt-2">
        <Button label={t('recipes.addRecipe')} onPress={() => openNewRecipe('dish')} />
        <Button
          label={t('recipes.addSubRecipe')}
          onPress={() => openNewRecipe('sub-recipe')}
          variant="secondary"
        />
      </View>
    </View>
  );
}
