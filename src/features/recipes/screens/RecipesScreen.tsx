import { FlashList } from '@shopify/flash-list';
import { Decimal } from 'decimal.js';
import { LinearGradient } from 'expo-linear-gradient';
import { getLocales } from 'expo-localization';
import { router, useFocusEffect } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Image, Pressable, Text, TextInput, View } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { SafeAreaView } from 'react-native-safe-area-context';

import { createDrizzleClient } from '@core/db/client';
import { currencyFractionDigits, formatCurrency } from '@core/costing/money';
import { AddRecipeSheet } from '@features/recipes/components/AddRecipeSheet';
import {
  listRecipeSummaries,
  type RecipeSummary,
} from '@features/recipes/data/recipeRepository';
import { getAppSettings, type AppSettings } from '@features/settings';
import { Colors, HERO_BOTTOM, HERO_GRADIENT, HERO_TOP } from '@shared/theme';

type RecipeTypeFilter = 'all' | 'dish' | 'sub-recipe';

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
  const isSubRecipe = summary.recipe.isSubRecipe;
  const cost = formatCurrency(new Decimal(summary.costPerUnit), currency, locale);
  const costLabel = isSubRecipe ? t('recipes.costPerYieldUnit') : t('recipes.costPerPortion');
  const typeLabel = isSubRecipe ? t('recipes.subRecipeType') : t('recipes.dishType');
  const accessibilityLabel = t('recipes.recipeSummary', {
    name: summary.recipe.name,
    type: typeLabel,
    cost,
    count: summary.itemCount,
  });

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      className="mb-3 flex-row items-center gap-3 rounded-3xl border border-line bg-surface p-3 shadow-sm">
      {!isSubRecipe && summary.recipe.imageUri ? (
        <Image
          accessibilityLabel={summary.recipe.name}
          source={{ uri: summary.recipe.imageUri }}
          resizeMode="cover"
          className="h-14 w-14 shrink-0 rounded-2xl"
        />
      ) : (
        <View className="h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-brandSoft">
          <SymbolView
            name={
              isSubRecipe
                ? { ios: 'square.stack.3d.up', android: 'layers', web: 'layers' }
                : { ios: 'fork.knife', android: 'restaurant_menu', web: 'restaurant_menu' }
            }
            tintColor={Colors.light.tint}
            size={22}
          />
        </View>
      )}

      <View className="min-w-0 flex-1 gap-1.5">
        <Text
          numberOfLines={1}
          className="font-inter-bold text-[16px] leading-[20px] text-ink">
          {summary.recipe.name}
        </Text>
        <View className="flex-row items-center gap-1.5">
          <View
            className="h-1.5 w-1.5 shrink-0 rounded-full"
            style={{
              backgroundColor: isSubRecipe ? Colors.light.tabIconDefault : Colors.light.tint,
            }}
          />
          <Text
            numberOfLines={1}
            className="shrink font-inter-semibold text-[11px] uppercase tracking-[0.6px] text-muted">
            {typeLabel}
          </Text>
          <Text numberOfLines={1} className="shrink font-inter text-[11px] text-muted">
            · {t('recipes.itemsCount', { count: summary.itemCount })}
          </Text>
        </View>
      </View>

      <View className="shrink-0 items-end">
        <Text
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.6}
          className="font-inter-extrabold text-[15px] leading-[20px] text-ink">
          {cost}
        </Text>
        <Text
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.7}
          className="font-inter-semibold text-[10px] text-muted">
          {costLabel}
        </Text>
      </View>

      <SymbolView
        name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }}
        tintColor={Colors.light.tabIconDefault}
        size={18}
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
  const [typeFilter, setTypeFilter] = useState<RecipeTypeFilter>('all');
  const [isAddSheetOpen, setIsAddSheetOpen] = useState(false);
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

  const searched = summaries.filter((summary) =>
    summary.recipe.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
  );
  const searchedDishes = searched.filter((summary) => !summary.recipe.isSubRecipe);
  const searchedSubRecipes = searched.filter((summary) => summary.recipe.isSubRecipe);
  const visibleRecipes =
    typeFilter === 'dish'
      ? searchedDishes
      : typeFilter === 'sub-recipe'
        ? searchedSubRecipes
        : searched;
  const currency = appSettings?.currencyCode ?? deviceCurrency;
  const locale = appSettings?.locale ?? deviceLocale;

  const filterTiles = [
    { id: 'all', label: t('recipes.filterAll'), count: searched.length },
    { id: 'dish', label: t('recipes.dishType'), count: searchedDishes.length },
    { id: 'sub-recipe', label: t('recipes.subRecipeType'), count: searchedSubRecipes.length },
  ] satisfies { id: RecipeTypeFilter; label: string; count: number }[];
  const hasRecipes = summaries.length > 0;

  const openNewRecipe = (type: 'dish' | 'sub-recipe') => {
    router.push({ pathname: '/recipe/[id]', params: { id: 'new', type } });
  };

  const listHeader = (
    <View>
      {/* Continues the hero gradient so the type tiles float over it. */}
      <LinearGradient
        colors={[HERO_BOTTOM, Colors.light.background] as const}
        locations={[0.25, 1]}
        style={{ height: hasRecipes ? 140 : 72 }}
      />

      {hasRecipes ? (
        <View className="-mt-28 flex-row gap-3 px-4">
          {filterTiles.map((tile) => {
            const selected = tile.id === typeFilter;
            return (
              <Pressable
                key={tile.id}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityLabel={t('recipes.selectTypeFilter', {
                  filter: tile.label,
                  count: tile.count,
                })}
                onPress={() => setTypeFilter(tile.id)}
                className={`flex-1 items-center gap-1 rounded-3xl border px-2 py-3 shadow-sm ${
                  selected ? 'border-brand bg-brandSoft' : 'border-line bg-surface'
                }`}>
                <Text
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.5}
                  className={`font-inter-extrabold text-[26px] leading-[30px] ${
                    selected ? 'text-brand' : 'text-ink'
                  }`}>
                  {tile.count}
                </Text>
                <Text
                  numberOfLines={2}
                  className={`text-center font-inter-semibold text-[10px] uppercase tracking-[0.4px] ${
                    selected ? 'text-brand' : 'text-muted'
                  }`}>
                  {tile.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      <View className="mt-4 gap-3 px-4">
        {error ? (
          <View className="rounded-2xl border border-line bg-badSoft p-3.5">
            <Text accessibilityRole="alert" className="font-inter text-[14px] leading-[20px] text-bad">
              {error}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('recipes.retry')}
              onPress={() => void loadRecipes()}
              className="min-h-11 justify-center">
              <Text className="font-inter-semibold text-[14px] text-brand">{t('recipes.retry')}</Text>
            </Pressable>
          </View>
        ) : null}

        {hasRecipes ? (
          <View className="flex-row items-center justify-between pt-2 pb-1">
            <Text className="font-inter-extrabold text-[18px] text-ink">
              {t('recipes.listHeading')}
            </Text>
            <View className="rounded-full bg-brandSoft px-2.5 py-1">
              <Text className="font-inter-bold text-[11px] text-brand">
                {t('recipes.totalCount', { count: visibleRecipes.length })}
              </Text>
            </View>
          </View>
        ) : null}
      </View>
    </View>
  );

  return (
    <SafeAreaView edges={['top']} className="flex-1" style={{ backgroundColor: HERO_TOP }}>
      <LinearGradient
        colors={HERO_GRADIENT}
        style={{ paddingHorizontal: 16, paddingBottom: 18, paddingTop: 8 }}>
        <View className="flex-row items-center justify-between gap-3">
          <Text
            accessibilityRole="header"
            className="flex-1 font-inter-extrabold text-[30px] leading-[36px] text-white">
            {t('recipes.title')}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('recipes.newRecipe')}
            onPress={() => setIsAddSheetOpen(true)}
            className="h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/30 bg-white/15">
            <SymbolView
              name={{ ios: 'plus', android: 'add', web: 'add' }}
              tintColor="#FFFFFF"
              size={24}
            />
          </Pressable>
        </View>

        <Text className="mt-1 font-inter text-[13px] leading-[18px] text-white">
          {t('recipes.subtitle')}
        </Text>

        <View className="mt-3.5 flex-row items-center rounded-2xl bg-surface px-3 shadow-md">
          <SymbolView
            name={{ ios: 'magnifyingglass', android: 'search', web: 'search' }}
            tintColor={Colors.light.tabIconDefault}
            size={20}
          />
          <TextInput
            accessibilityLabel={t('recipes.search')}
            value={query}
            onChangeText={setQuery}
            placeholder={t('recipes.search')}
            placeholderTextColor={Colors.light.tabIconDefault}
            returnKeyType="search"
            className="min-h-12 flex-1 px-3 py-0 font-inter text-[15px] text-ink"
          />
          {query ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('recipes.clearSearch')}
              onPress={() => setQuery('')}
              className="h-12 w-12 items-center justify-center">
              <SymbolView
                name={{ ios: 'xmark.circle.fill', android: 'cancel', web: 'cancel' }}
                tintColor={Colors.light.tabIconDefault}
                size={20}
              />
            </Pressable>
          ) : null}
        </View>
      </LinearGradient>

      <FlashList
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
        ListHeaderComponent={listHeader}
        ListEmptyComponent={
          isLoading ? (
            <Text className="py-8 text-center font-inter text-[15px] text-muted">
              {t('recipes.loading')}
            </Text>
          ) : !hasRecipes ? (
            <View className="items-center gap-2 px-6 py-10">
              <View className="h-14 w-14 items-center justify-center rounded-full bg-brandSoft">
                <SymbolView
                  name={{
                    ios: 'fork.knife',
                    android: 'restaurant_menu',
                    web: 'restaurant_menu',
                  }}
                  tintColor={Colors.light.tint}
                  size={26}
                />
              </View>
              <Text className="mt-1 font-inter-bold text-[17px] text-ink">
                {t('recipes.emptyTitle')}
              </Text>
              <Text className="text-center font-inter text-[14px] leading-[20px] text-muted">
                {t('recipes.emptyBody')}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('recipes.addRecipe')}
                onPress={() => setIsAddSheetOpen(true)}
                className="mt-2 min-h-12 items-center justify-center rounded-2xl bg-brand px-6 shadow-sm">
                <Text className="font-inter-semibold text-[15px] text-white">
                  {t('recipes.addRecipe')}
                </Text>
              </Pressable>
            </View>
          ) : query.trim() && searched.length === 0 ? (
            <View className="items-center gap-2 px-4 py-8">
              <Text className="text-center font-inter text-[14px] text-muted">
                {t('recipes.noResults')}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('recipes.clearSearch')}
                onPress={() => setQuery('')}
                className="min-h-11 justify-center">
                <Text className="font-inter-semibold text-[14px] text-brand">
                  {t('recipes.clearSearch')}
                </Text>
              </Pressable>
            </View>
          ) : typeFilter !== 'all' ? (
            <View className="items-center gap-2 px-4 py-8">
              <Text className="text-center font-inter text-[14px] text-muted">
                {t('recipes.noResultsInFilter')}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('recipes.showAllRecipes')}
                onPress={() => setTypeFilter('all')}
                className="min-h-11 justify-center">
                <Text className="font-inter-semibold text-[14px] text-brand">
                  {t('recipes.showAllRecipes')}
                </Text>
              </Pressable>
            </View>
          ) : null
        }
        contentContainerStyle={{ flexGrow: 1, paddingBottom: 24 }}
        style={{ flex: 1, backgroundColor: Colors.light.background }}
      />

      <AddRecipeSheet
        visible={isAddSheetOpen}
        onClose={() => setIsAddSheetOpen(false)}
        onSelect={(type) => {
          setIsAddSheetOpen(false);
          openNewRecipe(type);
        }}
      />
    </SafeAreaView>
  );
}
