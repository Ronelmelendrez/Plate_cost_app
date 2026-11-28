import { FlashList } from '@shopify/flash-list';
import { Decimal } from 'decimal.js';
import { LinearGradient } from 'expo-linear-gradient';
import { getLocales } from 'expo-localization';
import { router, useFocusEffect } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, TextInput, View } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { SafeAreaView } from 'react-native-safe-area-context';

import { createDrizzleClient } from '@core/db/client';
import {
  costPerUsableBaseUnit,
  getFriendlyUnitRate,
  purchaseBaseUnit,
  type UnitSystem,
} from '@core/costing/units';
import {
  currencyFractionDigits,
  formatCurrency,
  formatUnitCost,
} from '@core/costing/money';
import {
  listIngredients,
  markIngredientRecent,
  setIngredientFavourite,
  type IngredientListItem,
} from '@features/ingredients/data/ingredientRepository';
import {
  listPackagingItems,
  markPackagingRecent,
  setPackagingFavourite,
  type PackagingItem,
} from '@features/packaging';
import { getAppSettings, type AppSettings } from '@features/settings';
import { Colors, HERO_BOTTOM, HERO_GRADIENT, HERO_TOP } from '@shared/theme';

const localeInfo = getLocales()[0];
const deviceLocale = localeInfo?.languageTag ?? 'en-US';
const deviceCurrency = localeInfo?.currencyCode ?? 'USD';

function IngredientRow({
  ingredient,
  currency,
  locale,
  unitSystem,
  onPress,
  onToggleFavourite,
}: {
  ingredient: IngredientListItem;
  currency: string;
  locale: string;
  unitSystem: UnitSystem;
  onPress: () => void;
  onToggleFavourite: () => void;
}) {
  const { t } = useTranslation();
  const fractionDigits = currencyFractionDigits(currency, locale);
  const purchaseConversion = ingredient.conversions.find(
    (conversion) => conversion.fromUnit === ingredient.purchaseUnit,
  );
  const costPerUnit = costPerUsableBaseUnit({
    priceMinor: ingredient.purchasePriceMinor,
    fractionDigits,
    purchaseQuantity: ingredient.purchaseQuantity,
    purchaseUnit: ingredient.purchaseUnit,
    usableYieldPct: ingredient.usableYieldPct,
    conversion: purchaseConversion,
  });
  const purchasePrice = new Decimal(ingredient.purchasePriceMinor).div(
    new Decimal(10).pow(fractionDigits),
  );
  const baseUnit = purchaseBaseUnit(ingredient.purchaseUnit, purchaseConversion);
  const friendlyRate = getFriendlyUnitRate(costPerUnit, baseUnit, unitSystem);
  const price = formatCurrency(purchasePrice, currency, locale);
  const unitCost = formatUnitCost(friendlyRate.cost, currency, locale);
  const quantityAndUnit = `${ingredient.purchaseQuantity} ${t(`units.${ingredient.purchaseUnit}`)}`;
  const accessibleName = t('ingredients.ingredientDetail', {
    name: ingredient.name,
    quantity: ingredient.purchaseQuantity,
    unit: t(`units.${ingredient.purchaseUnit}`),
    price,
    cost: unitCost,
    baseUnit: t(`units.${friendlyRate.unit}`),
    yield: ingredient.usableYieldPct,
  });

  return (
    <View className="mb-3 flex-row items-center gap-3 rounded-3xl border border-line bg-surface p-3 shadow-sm">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibleName}
        onPress={onPress}
        className="min-h-14 flex-1 flex-row items-center gap-3">
        <View className="h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-brandSoft">
          <SymbolView
            name={{
              ios: 'basket.fill',
              android: 'shopping_basket',
              web: 'shopping_basket',
            }}
            tintColor={Colors.light.tint}
            size={22}
          />
        </View>

        <View className="min-w-0 flex-1 gap-1">
          <Text
            numberOfLines={1}
            className="font-inter-bold text-[16px] leading-[20px] text-ink">
            {ingredient.name}
          </Text>
          <Text
            numberOfLines={1}
            className="font-inter text-[13px] leading-[18px] text-muted">
            {unitCost} / {t(`units.${friendlyRate.unit}`)}
            {' · '}
            {quantityAndUnit}
          </Text>
        </View>

        <View className="shrink-0 items-end gap-0.5">
          <Text
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.6}
            className="font-inter-extrabold text-[15px] leading-[20px] text-ink">
            {price}
          </Text>
          <View className="rounded-full bg-brandSoft px-2 py-0.5">
            <Text
              numberOfLines={1}
              className="font-inter-semibold text-[10px] text-brand">
              {t(`units.${ingredient.purchaseUnit}`)}
            </Text>
          </View>
        </View>
      </Pressable>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          ingredient.isFavourite ? t('ingredients.removeFavourite') : t('ingredients.addFavourite')
        }
        onPress={onToggleFavourite}
        className="h-11 w-11 shrink-0 items-center justify-center rounded-full bg-bg">
        <SymbolView
          name={
            ingredient.isFavourite
              ? { ios: 'heart.fill', android: 'favorite', web: 'favorite' }
              : { ios: 'heart', android: 'favorite_border', web: 'favorite_border' }
          }
          tintColor={ingredient.isFavourite ? Colors.light.tint : Colors.light.tabIconDefault}
          size={20}
        />
      </Pressable>
    </View>
  );
}

function PackagingLibraryRow({
  item,
  currency,
  locale,
  onPress,
  onToggleFavourite,
}: {
  item: PackagingItem;
  currency: string;
  locale: string;
  onPress: () => void;
  onToggleFavourite: () => void;
}) {
  const { t } = useTranslation();
  const fractionDigits = currencyFractionDigits(currency, locale);
  const packPrice = new Decimal(item.packPriceMinor).div(
    new Decimal(10).pow(fractionDigits),
  );
  const costPerPiece = packPrice.div(item.piecesPerPack);

  return (
    <View className="mb-3 flex-row items-center gap-3 rounded-3xl border border-line bg-surface p-3 shadow-sm">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('packaging.itemSummary', {
          name: item.name,
          cost: formatUnitCost(costPerPiece, currency, locale),
          count: item.piecesPerPack,
        })}
        onPress={onPress}
        className="min-h-14 flex-1 justify-center gap-1">
        <Text numberOfLines={1} className="font-inter-bold text-[16px] text-ink">
          {item.name}
        </Text>
        <Text numberOfLines={1} className="font-inter text-[13px] text-muted">
          {t('packaging.costPerPiece', {
            cost: formatUnitCost(costPerPiece, currency, locale),
          })}
          {' · '}
          {t('packaging.packSize', { count: item.piecesPerPack })}
        </Text>
      </Pressable>
      <View className="shrink-0 items-end">
        <Text className="font-inter-extrabold text-[15px] text-ink">
          {formatCurrency(packPrice, currency, locale)}
        </Text>
        <Text className="font-inter text-[11px] text-muted">{t('packaging.packPrice')}</Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          item.isFavourite ? t('ingredients.removeFavourite') : t('ingredients.addFavourite')
        }
        onPress={onToggleFavourite}
        className="h-11 w-11 shrink-0 items-center justify-center rounded-full bg-bg">
        <SymbolView
          name={
            item.isFavourite
              ? { ios: 'heart.fill', android: 'favorite', web: 'favorite' }
              : { ios: 'heart', android: 'favorite_border', web: 'favorite_border' }
          }
          tintColor={item.isFavourite ? Colors.light.tint : Colors.light.tabIconDefault}
          size={20}
        />
      </Pressable>
    </View>
  );
}

export default function IngredientsScreen() {
  const sqlite = useSQLiteContext();
  const database = useMemo(() => createDrizzleClient(sqlite), [sqlite]);
  const { t } = useTranslation();
  const [ingredients, setIngredients] = useState<IngredientListItem[]>([]);
  const [packagingItems, setPackagingItems] = useState<PackagingItem[]>([]);
  const [libraryView, setLibraryView] = useState<'ingredients' | 'packaging'>('ingredients');
  const [appSettings, setAppSettings] = useState<AppSettings | null>(null);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  const loadLibrary = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      setAppSettings(await getAppSettings(database));
      if (libraryView === 'ingredients') {
        setIngredients(await listIngredients(database, search));
      } else {
        setPackagingItems(await listPackagingItems(database, search));
      }
    } catch (loadError) {
      console.error('Unable to load ingredients.', loadError);
      setError(t('ingredients.loadError'));
    } finally {
      setIsLoading(false);
    }
  }, [database, libraryView, search, t]);

  const currency = appSettings?.currencyCode ?? deviceCurrency;
  const locale = appSettings?.locale ?? deviceLocale;

  useFocusEffect(
    useCallback(() => {
      void loadLibrary();
    }, [loadLibrary]),
  );

  const openIngredient = async (ingredient: IngredientListItem) => {
    try {
      await markIngredientRecent(database, ingredient.id);
    } catch (updateError) {
      console.error('Unable to update recent ingredient.', updateError);
      setError(t('ingredients.updateError'));
    }
    router.push(`/ingredient/${ingredient.id}`);
  };

  const toggleFavourite = async (ingredient: IngredientListItem) => {
    try {
      await setIngredientFavourite(database, ingredient.id, !ingredient.isFavourite);
      await loadLibrary();
    } catch (updateError) {
      console.error('Unable to update ingredient favourite.', updateError);
      setError(t('ingredients.updateError'));
    }
  };

  const openPackaging = async (item: PackagingItem) => {
    try {
      await markPackagingRecent(database, item.id);
    } catch (updateError) {
      console.error('Unable to update recent packaging.', updateError);
      setError(t('packaging.updateError'));
    }
    router.push({ pathname: '/packaging/[id]', params: { id: item.id } });
  };

  const togglePackagingFavourite = async (item: PackagingItem) => {
    try {
      await setPackagingFavourite(database, item.id, !item.isFavourite);
      await loadLibrary();
    } catch (updateError) {
      console.error('Unable to update packaging favourite.', updateError);
      setError(t('packaging.updateError'));
    }
  };

  const isIngredientsView = libraryView === 'ingredients';
  const visibleCount = isIngredientsView ? ingredients.length : packagingItems.length;
  const hasItems = visibleCount > 0;
  const listData = isIngredientsView ? ingredients : packagingItems;

  const listHeader = (
    <View>
      {/* Continues the hero gradient so the section heading floats over it. */}
      <LinearGradient
        colors={[HERO_BOTTOM, Colors.light.background] as const}
        locations={[0.25, 1]}
        style={{ height: hasItems ? 96 : 72 }}
      />

      <View className="mt-4 gap-3 px-4">
        {error ? (
          <View className="rounded-2xl border border-line bg-badSoft p-3.5">
            <Text accessibilityRole="alert" className="font-inter text-[14px] leading-[20px] text-bad">
              {error}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('ingredients.retry')}
              onPress={() => void loadLibrary()}
              className="min-h-11 justify-center">
              <Text className="font-inter-semibold text-[14px] text-brand">
                {t('ingredients.retry')}
              </Text>
            </Pressable>
          </View>
        ) : null}

        {hasItems ? (
          <View className="flex-row items-center justify-between pb-1">
            <Text className="font-inter-extrabold text-[18px] text-ink">
              {t(isIngredientsView ? 'ingredients.listHeading' : 'packaging.listHeading')}
            </Text>
            <View className="rounded-full bg-brandSoft px-2.5 py-1">
              <Text className="font-inter-bold text-[11px] text-brand">
                {t(isIngredientsView ? 'ingredients.totalCount' : 'packaging.totalCount', {
                  count: visibleCount,
                })}
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
            {t('ingredients.title')}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t(
              isIngredientsView ? 'ingredients.addIngredient' : 'packaging.addItem',
            )}
            onPress={() =>
              isIngredientsView
                ? router.push('/ingredient/new')
                : router.push({ pathname: '/packaging/[id]', params: { id: 'new' } })
            }
            className="h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/30 bg-white/15">
            <SymbolView
              name={{ ios: 'plus', android: 'add', web: 'add' }}
              tintColor="#FFFFFF"
              size={24}
            />
          </Pressable>
        </View>

        <View className="mt-4 flex-row rounded-2xl bg-white/15 p-1">
          {(['ingredients', 'packaging'] as const).map((view) => (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: libraryView === view }}
              key={view}
              onPress={() => setLibraryView(view)}
              className={`min-h-11 flex-1 items-center justify-center rounded-xl px-3 ${
                libraryView === view ? 'bg-surface' : ''
              }`}>
              <Text
                className={`font-inter-semibold text-sm ${
                  libraryView === view ? 'text-brand' : 'text-white'
                }`}>
                {t(view === 'ingredients' ? 'ingredients.title' : 'packaging.title')}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text className="mt-1 font-inter text-[13px] leading-[18px] text-white">
          {t(isIngredientsView ? 'ingredients.subtitle' : 'packaging.subtitle')}
        </Text>

        <View className="mt-3.5 flex-row items-center rounded-2xl bg-surface px-3 shadow-md">
          <SymbolView
            name={{ ios: 'magnifyingglass', android: 'search', web: 'search' }}
            tintColor={Colors.light.tabIconDefault}
            size={20}
          />
          <TextInput
            accessibilityLabel={t('ingredients.search')}
            value={search}
            onChangeText={setSearch}
            placeholder={t('ingredients.search')}
            placeholderTextColor={Colors.light.tabIconDefault}
            returnKeyType="search"
            className="min-h-12 flex-1 px-3 py-0 font-inter text-[15px] text-ink"
          />
          {search ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('ingredients.clearSearch')}
              onPress={() => setSearch('')}
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

      <FlashList<IngredientListItem | PackagingItem>
        data={listData}
        keyExtractor={(item) => item.id}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) =>
          'purchaseUnit' in item ? (
            <IngredientRow
              ingredient={item}
              currency={currency}
              locale={locale}
              unitSystem={appSettings?.unitSystem ?? 'metric'}
              onPress={() => void openIngredient(item)}
              onToggleFavourite={() => void toggleFavourite(item)}
            />
          ) : (
            <PackagingLibraryRow
              item={item}
              currency={currency}
              locale={locale}
              onPress={() => void openPackaging(item)}
              onToggleFavourite={() => void togglePackagingFavourite(item)}
            />
          )
        }
        ListHeaderComponent={listHeader}
        ListEmptyComponent={
          isLoading ? (
            <Text className="py-8 text-center font-inter text-[15px] text-muted">
              {t('ingredients.loading')}
            </Text>
          ) : search.trim() ? (
            <View className="items-center gap-2 px-4 py-8">
              <Text className="text-center font-inter text-[14px] text-muted">
                {t('ingredients.noResults')}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('ingredients.clearSearch')}
                onPress={() => setSearch('')}
                className="min-h-11 justify-center">
                <Text className="font-inter-semibold text-[14px] text-brand">
                  {t('ingredients.clearSearch')}
                </Text>
              </Pressable>
            </View>
          ) : isIngredientsView ? (
            <View className="items-center gap-2 px-6 py-10">
              <View className="h-14 w-14 items-center justify-center rounded-full bg-brandSoft">
                <SymbolView
                  name={{
                    ios: 'basket.fill',
                    android: 'shopping_basket',
                    web: 'shopping_basket',
                  }}
                  tintColor={Colors.light.tint}
                  size={26}
                />
              </View>
              <Text className="mt-1 font-inter-bold text-[17px] text-ink">
                {t('ingredients.emptyTitle')}
              </Text>
              <Text className="text-center font-inter text-[14px] leading-[20px] text-muted">
                {t('ingredients.emptyBody')}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('ingredients.addIngredient')}
                onPress={() => router.push('/ingredient/new')}
                className="mt-2 min-h-12 items-center justify-center rounded-2xl bg-brand px-6 shadow-sm">
                <Text className="font-inter-semibold text-[15px] text-white">
                  {t('ingredients.addIngredient')}
                </Text>
              </Pressable>
            </View>
          ) : (
            <View className="items-center gap-2 px-6 py-10">
              <Text className="mt-1 font-inter-bold text-[17px] text-ink">
                {t('packaging.emptyTitle')}
              </Text>
              <Text className="text-center font-inter text-[14px] leading-[20px] text-muted">
                {t('packaging.emptyBody')}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('packaging.addItem')}
                onPress={() =>
                  router.push({ pathname: '/packaging/[id]', params: { id: 'new' } })
                }
                className="mt-2 min-h-12 items-center justify-center rounded-2xl bg-brand px-6 shadow-sm">
                <Text className="font-inter-semibold text-[15px] text-white">
                  {t('packaging.addItem')}
                </Text>
              </Pressable>
            </View>
          )
        }
        contentContainerStyle={{ flexGrow: 1, paddingBottom: 24 }}
        style={{ flex: 1, backgroundColor: Colors.light.background }}
      />
    </SafeAreaView>
  );
}
