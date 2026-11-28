import { Decimal } from 'decimal.js';
import { getLocales } from 'expo-localization';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { createDrizzleClient } from '@core/db/client';
import {
  CONVERSION_UNITS,
  BASE_UNITS,
  costPerUsableBaseUnit,
  getFriendlyUnitRate,
  PURCHASE_UNITS,
  purchaseBaseUnit,
  type UnitSystem,
  type PurchaseUnit,
} from '@core/costing/units';
import {
  currencyAffixes,
  currencyFractionDigits,
  formatDecimalInput,
  formatCurrency,
  formatUnitCost,
  parseDecimal,
  toMinorUnits,
} from '@core/costing/money';
import { getAppSettings, type AppSettings } from '@features/settings';
import {
  getIngredient,
  getIngredientConversions,
  getIngredientPriceHistory,
  markIngredientRecent,
  saveIngredient,
  type Ingredient,
  type IngredientPriceRecord,
} from '@features/ingredients/data/ingredientRepository';
import {
  IngredientConversionEditor,
  type ConversionDraft,
} from '@features/ingredients/components/IngredientConversionEditor';
import type { PriceChangeImpactReport } from '@features/impact/data/impactRepository';
import { getPriceChangeImpact } from '@features/impact/data/impactRepository';
import { PriceChangeImpactSheet } from '@features/impact/components/PriceChangeImpactSheet';
import { Button, TextField } from '@shared/ui';
import { Colors, HERO_GRADIENT, HERO_TOP } from '@shared/theme';

const localeInfo = getLocales()[0];
const deviceLocale = localeInfo?.languageTag ?? 'en-US';
const deviceCurrency = localeInfo?.currencyCode ?? 'USD';
type FormErrors = {
  name?: string;
  quantity?: string;
  price?: string;
  usableYield?: string;
  conversions?: string;
};

function priceForRecord(record: IngredientPriceRecord, fractionDigits: number) {
  return new Decimal(record.priceMinor).div(new Decimal(10).pow(fractionDigits));
}

function PriceHistory({
  records,
  currency,
  locale,
  unitSystem,
}: {
  records: IngredientPriceRecord[];
  currency: string;
  locale: string;
  unitSystem: UnitSystem;
}) {
  const { t } = useTranslation();
  const fractionDigits = currencyFractionDigits(currency, locale);

  if (records.length === 0) {
    return <Text className="font-inter text-base text-muted">{t('ingredients.noPriceHistory')}</Text>;
  }

  return (
    <View>
      {records.map((record) => (
        <View className="flex-row items-start justify-between border-b border-line py-3" key={record.id}>
          <View className="flex-1 gap-1">
            <Text className="text-base font-inter-semibold text-ink">
              {formatCurrency(priceForRecord(record, fractionDigits), currency, locale)}
            </Text>
            <Text className="font-inter text-sm text-muted">
              {t('ingredients.priceChange', {
                quantity: record.purchaseQuantity,
                unit: t(`units.${record.purchaseUnit}`),
              })}
            </Text>
            <Text className="font-inter text-sm text-muted">
              {t('ingredients.historyUnitPrice', {
                cost: formatUnitCost(
                  getFriendlyUnitRate(
                    priceForRecord(record, fractionDigits)
                      .div(record.purchaseBaseQuantity)
                      .div(new Decimal(record.usableYieldPct).div(100)),
                    record.purchaseBaseUnit,
                    unitSystem,
                  ).cost,
                  currency,
                  locale,
                ),
                unit: t(
                  `units.${getFriendlyUnitRate(
                    priceForRecord(record, fractionDigits)
                      .div(record.purchaseBaseQuantity)
                      .div(new Decimal(record.usableYieldPct).div(100)),
                    record.purchaseBaseUnit,
                    unitSystem,
                  ).unit}`,
                ),
              })}
            </Text>
          </View>
          <Text className="ms-3 font-inter text-sm text-muted">
            {new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(
              new Date(record.recordedAt),
            )}
          </Text>
        </View>
      ))}
    </View>
  );
}

export default function IngredientDetailScreen({ mode = 'edit' }: { mode?: 'create' | 'edit' }) {
  const { id } = useLocalSearchParams<{ id: string }>();
  const isCreate = mode === 'create';
  const sqlite = useSQLiteContext();
  const database = useMemo(() => createDrizzleClient(sqlite), [sqlite]);
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [appSettings, setAppSettings] = useState<AppSettings | null>(null);
  const locale = appSettings?.locale ?? deviceLocale;
  const currency = appSettings?.currencyCode ?? deviceCurrency;
  const fractionDigits = currencyFractionDigits(currency, locale);
  const priceAffixes = currencyAffixes(currency, locale);

  const [name, setName] = useState('');
  const [purchaseUnit, setPurchaseUnit] = useState<PurchaseUnit>('kg');
  const [purchaseQuantity, setPurchaseQuantity] = useState('');
  const [price, setPrice] = useState('');
  const [usableYieldPct, setUsableYieldPct] = useState('100');
  const [conversions, setConversions] = useState<ConversionDraft[]>([]);
  const [priceHistory, setPriceHistory] = useState<IngredientPriceRecord[]>([]);
  const [originalIngredient, setOriginalIngredient] = useState<Ingredient | null>(null);
  const [impactReport, setImpactReport] = useState<PriceChangeImpactReport | null>(null);
  const [isMoreOptionsOpen, setIsMoreOptionsOpen] = useState(false);
  const [isPriceHistoryLoading, setIsPriceHistoryLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [formErrors, setFormErrors] = useState<FormErrors>({});
  const [formError, setFormError] = useState('');
  const [historyError, setHistoryError] = useState('');

  useEffect(() => {
    let isMounted = true;
    async function loadIngredient() {
      try {
        const settings = await getAppSettings(database);
        if (!isMounted) {
          return;
        }
        setAppSettings(settings);
        if (isCreate) {
          setPurchaseUnit(settings.unitSystem === 'us' ? 'lb' : 'kg');
          setIsReady(true);
          return;
        }
        if (!id) {
          setFormError(t('ingredients.notFound'));
          return;
        }
        const [ingredient, savedConversions] = await Promise.all([
          getIngredient(database, id),
          getIngredientConversions(database, id),
        ]);
        if (!ingredient) {
          setFormError(t('ingredients.notFound'));
          return;
        }
        if (!isMounted) {
          return;
        }

        const conversionDrafts = savedConversions.map((conversion) => ({
          fromUnit: conversion.fromUnit,
          baseQuantity: conversion.baseQuantity,
          baseUnit: conversion.baseUnit,
        }));
        setOriginalIngredient(ingredient);
        setName(ingredient.name);
        setPurchaseUnit(ingredient.purchaseUnit);
        setPurchaseQuantity(ingredient.purchaseQuantity);
        setPrice(
          new Decimal(ingredient.purchasePriceMinor)
            .div(new Decimal(10).pow(fractionDigits))
            .toFixed(fractionDigits),
        );
        setUsableYieldPct(ingredient.usableYieldPct);
        setConversions(conversionDrafts);
        setIsReady(true);
        void markIngredientRecent(database, ingredient.id).catch((recentError: unknown) => {
          console.error('Unable to update recent ingredient.', recentError);
        });
      } catch (loadError) {
        console.error('Unable to load ingredient.', loadError);
        if (isMounted) {
          setFormError(t('ingredients.loadError'));
        }
      }
    }

    void loadIngredient();
    return () => {
      isMounted = false;
    };
  }, [database, fractionDigits, id, isCreate, t]);

  const loadPriceHistory = async () => {
    if (!id || isCreate) {
      return;
    }
    setIsPriceHistoryLoading(true);
    setHistoryError('');
    try {
      setPriceHistory(await getIngredientPriceHistory(database, id));
    } catch (loadError) {
      console.error('Unable to load ingredient price history.', loadError);
      setHistoryError(t('ingredients.historyError'));
    } finally {
      setIsPriceHistoryLoading(false);
    }
  };

  const purchaseQuantityValue = parseDecimal(purchaseQuantity, locale);
  const priceValue = parseDecimal(price, locale);
  const usableYieldValue = parseDecimal(usableYieldPct, locale);
  const livePriceMinor = priceValue ? toMinorUnits(priceValue, fractionDigits) : null;
  let liveUnitCost: Decimal | null = null;
  const purchaseConversion = conversions.find(
    (conversion) => conversion.fromUnit === purchaseUnit,
  );
  const purchaseConversionQuantity = purchaseConversion
    ? parseDecimal(purchaseConversion.baseQuantity, locale)
    : undefined;
  if (
    purchaseQuantityValue?.gt(0) &&
    priceValue?.gt(0) &&
    livePriceMinor !== null &&
    usableYieldValue?.gte(1) &&
    usableYieldValue.lte(100) &&
    (purchaseUnit !== 'pack' ||
      (purchaseConversionQuantity?.gt(0) &&
        !!purchaseConversion &&
        BASE_UNITS.includes(purchaseConversion.baseUnit)))
  ) {
    liveUnitCost = costPerUsableBaseUnit({
      priceMinor: livePriceMinor,
      fractionDigits,
      purchaseQuantity: purchaseQuantityValue.toString(),
      purchaseUnit,
      usableYieldPct: usableYieldValue.toString(),
      conversion: purchaseConversion,
      unitSizes: {
        cupMl: appSettings?.cupMl ?? '240',
        tablespoonMl: appSettings?.tablespoonMl ?? '15',
      },
    });
  }
  const liveBaseUnit = liveUnitCost
    ? purchaseBaseUnit(purchaseUnit, purchaseConversion)
    : undefined;
  const friendlyRate =
    liveUnitCost && liveBaseUnit
      ? getFriendlyUnitRate(liveUnitCost, liveBaseUnit, appSettings?.unitSystem ?? 'metric')
      : undefined;

  const setFieldValue = (field: keyof FormErrors, setter: (value: string) => void) => (value: string) => {
    setter(value);
    setFormErrors((current) => ({ ...current, [field]: undefined }));
  };

  const handleSave = async () => {
    const errors: FormErrors = {};
    const parsedName = name.trim();
    const parsedQuantity = parseDecimal(purchaseQuantity, locale);
    const parsedPrice = parseDecimal(price, locale);
    const parsedYield = parseDecimal(usableYieldPct, locale);

    if (!parsedName) {
      errors.name = t('ingredients.nameRequired');
    }
    if (!parsedQuantity || parsedQuantity.lte(0)) {
      errors.quantity = t('ingredients.quantityRequired');
    }
    if (!parsedPrice || parsedPrice.lte(0)) {
      errors.price = t('ingredients.priceRequired');
    } else if (toMinorUnits(parsedPrice, fractionDigits) === null) {
      errors.price = t('ingredients.pricePrecision', { digits: fractionDigits, currency });
    }
    if (!parsedYield || parsedYield.lt(1) || parsedYield.gt(100)) {
      errors.usableYield = t('ingredients.yieldRequired');
    }
    if (purchaseUnit === 'pack' && !purchaseConversion) {
      errors.conversions = t('ingredients.packConversionRequired');
    }

    const customConversions: ConversionDraft[] = [];
    const conversionUnitsSeen = new Set<string>();
    for (const conversion of conversions) {
      const baseQuantity = parseDecimal(conversion.baseQuantity, locale);
      if (
        !baseQuantity ||
        baseQuantity.lte(0) ||
        !CONVERSION_UNITS.includes(conversion.fromUnit) ||
        !BASE_UNITS.includes(conversion.baseUnit) ||
        conversionUnitsSeen.has(conversion.fromUnit)
      ) {
        errors.conversions = t('ingredients.conversionError');
        break;
      }
      conversionUnitsSeen.add(conversion.fromUnit);
      customConversions.push({
        ...conversion,
        baseQuantity: baseQuantity.toString(),
      });
    }

    setFormErrors(errors);
    if (Object.keys(errors).length > 0 || !parsedQuantity || !parsedPrice || !parsedYield) {
      return;
    }

    const priceMinor = toMinorUnits(parsedPrice, fractionDigits);
    if (priceMinor === null) {
      return;
    }
    const costChanged =
      !isCreate &&
      originalIngredient !== null &&
      (originalIngredient.purchaseUnit !== purchaseUnit ||
        !new Decimal(originalIngredient.purchaseQuantity).eq(parsedQuantity) ||
        originalIngredient.purchasePriceMinor !== priceMinor ||
        !new Decimal(originalIngredient.usableYieldPct).eq(parsedYield));

    setIsSaving(true);
    setFormError('');
    try {
      const savedIngredientId = await saveIngredient(database, {
        id: isCreate ? undefined : id,
        name: parsedName,
        purchaseUnit,
        purchaseQuantity: parsedQuantity.toString(),
        purchasePriceMinor: priceMinor,
        usableYieldPct: parsedYield.toString(),
        conversions: customConversions,
      });
      if (costChanged) {
        try {
          const report = await getPriceChangeImpact(database, {
            type: 'ingredient',
            id: savedIngredientId,
          });
          if (report.dishes.length > 0) {
            setImpactReport(report);
            return;
          }
        } catch (impactError) {
          console.error('Unable to calculate ingredient price-change impact.', impactError);
          setFormError(t('impact.savedButImpactError'));
          return;
        }
      }
      router.back();
    } catch (saveError) {
      console.error('Unable to save ingredient.', saveError);
      setFormError(t('ingredients.saveError'));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <SafeAreaView edges={['top']} className="flex-1" style={{ backgroundColor: HERO_TOP }}>
      <LinearGradient
        colors={HERO_GRADIENT}
        style={{ paddingHorizontal: 16, paddingBottom: 16, paddingTop: 8 }}>
        <View className="flex-row items-center gap-3">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('ingredients.close')}
            onPress={() => router.back()}
            className="h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/30 bg-white/15">
            <SymbolView
              name={{ ios: 'chevron.left', android: 'arrow_back', web: 'arrow_back' }}
              tintColor="#FFFFFF"
              size={22}
            />
          </Pressable>
          <Text
            accessibilityRole="header"
            numberOfLines={1}
            className="min-w-0 flex-1 font-inter-extrabold text-[20px] leading-[26px] text-white">
            {isCreate ? t('ingredients.newIngredient') : t('ingredients.editIngredient')}
          </Text>
        </View>
      </LinearGradient>

      <ScrollView
        className="flex-1 bg-bg"
        contentContainerStyle={{ gap: 20, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 24 }}
        keyboardShouldPersistTaps="handled">
        {formError ? (
          <Text accessibilityRole="alert" className="font-inter text-base text-bad">
            {formError}
          </Text>
        ) : null}
        <TextField
          label={t('ingredients.name')}
          value={name}
          onChangeText={(value) => {
            setName(value);
            setFormErrors((current) => ({ ...current, name: undefined }));
          }}
          error={formErrors.name}
          accessibilityLabel={t('ingredients.name')}
        />
        <View className="gap-2">
          <Text className="text-sm font-inter-semibold text-ink">{t('ingredients.buyBy')}</Text>
          <View className="flex-row flex-wrap gap-2">
            {PURCHASE_UNITS.map((unit) => (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: purchaseUnit === unit }}
                accessibilityLabel={t('ingredients.selectPurchaseUnit', {
                  unit: t(`units.${unit}`),
                })}
                className={`min-h-12 min-w-12 items-center justify-center rounded-xl border px-3 ${
                  purchaseUnit === unit
                    ? 'border-ink bg-surface'
                    : 'border-line bg-surface'
                }`}
                key={unit}
                onPress={() => setPurchaseUnit(unit)}>
                <Text className="font-inter text-base text-ink">{t(`units.${unit}`)}</Text>
              </Pressable>
            ))}
          </View>
        </View>
        <TextField
          label={t('ingredients.quantityBought')}
          value={purchaseQuantity}
          onChangeText={setFieldValue('quantity', setPurchaseQuantity)}
          onBlur={() => setPurchaseQuantity(formatDecimalInput(purchaseQuantity, locale))}
          keyboardType="decimal-pad"
          suffix={t(`units.${purchaseUnit}`)}
          error={formErrors.quantity}
        />
        <TextField
          label={t('ingredients.pricePaid')}
          value={price}
          onChangeText={setFieldValue('price', setPrice)}
          onBlur={() => setPrice(formatDecimalInput(price, locale))}
          keyboardType="decimal-pad"
          prefix={priceAffixes.prefix}
          suffix={priceAffixes.suffix}
          error={formErrors.price}
        />
        <TextField
          label={t('ingredients.usableYield')}
          value={usableYieldPct}
          onChangeText={setFieldValue('usableYield', setUsableYieldPct)}
          onBlur={() => setUsableYieldPct(formatDecimalInput(usableYieldPct, locale))}
          keyboardType="decimal-pad"
          suffix="%"
          helperText={t('ingredients.usableYieldHelp')}
          error={formErrors.usableYield}
        />

        {liveUnitCost && liveBaseUnit && friendlyRate ? (
          <View className="rounded-xl border border-line bg-surface px-4 py-3">
            <Text className="text-base font-inter-semibold text-ink">
              {t('ingredients.costPerUsableUnit', {
                cost: formatUnitCost(liveUnitCost, currency, locale),
                unit: t(`units.${liveBaseUnit}`),
              })}
            </Text>
            <Text className="mt-1 font-inter text-sm text-muted">
              {t('ingredients.costPerFriendlyUnit', {
                cost: formatUnitCost(friendlyRate.cost, currency, locale),
                unit: t(`units.${friendlyRate.unit}`),
              })}
            </Text>
            <Text className="mt-1 font-inter text-xs leading-4 text-muted">
              {t('ingredients.unitCostPrecisionHelp')}
            </Text>
          </View>
        ) : null}

        <View className="border-t border-line pt-2">
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: isMoreOptionsOpen }}
            accessibilityLabel={t('ingredients.moreOptions')}
            onPress={() => {
              const next = !isMoreOptionsOpen;
              setIsMoreOptionsOpen(next);
              if (next && priceHistory.length === 0) {
                void loadPriceHistory();
              }
            }}
            className="min-h-12 flex-row items-center justify-between">
            <Text className="text-base font-inter-semibold text-ink">{t('ingredients.moreOptions')}</Text>
            <SymbolView
              name={
                isMoreOptionsOpen
                  ? { ios: 'chevron.up', android: 'expand_less', web: 'expand_less' }
                  : { ios: 'chevron.down', android: 'expand_more', web: 'expand_more' }
              }
              tintColor={Colors.light.text}
              size={22}
            />
          </Pressable>
          {isMoreOptionsOpen ? (
            <View className="gap-5 pb-2 pt-3">
              <IngredientConversionEditor
                conversions={conversions}
                locale={locale}
                onChange={(updatedConversions) => {
                  setConversions(updatedConversions);
                  setFormErrors((current) => ({ ...current, conversions: undefined }));
                }}
                error={formErrors.conversions}
              />
              {!isCreate ? (
                <View className="gap-2">
                  <Text className="text-base font-inter-semibold text-ink">
                    {t('ingredients.priceHistory')}
                  </Text>
                  {historyError ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={t('ingredients.retry')}
                      onPress={() => void loadPriceHistory()}
                      className="min-h-12 justify-center">
                      <Text accessibilityRole="alert" className="font-inter text-sm text-bad">
                        {t('ingredients.historyRetry')}
                      </Text>
                    </Pressable>
                  ) : isPriceHistoryLoading ? null : (
                    <PriceHistory
                      records={priceHistory}
                      currency={currency}
                      locale={locale}
                      unitSystem={appSettings?.unitSystem ?? 'metric'}
                    />
                  )}
                </View>
              ) : null}
            </View>
          ) : null}
        </View>
      </ScrollView>

      <View className="border-t border-line bg-bg px-4 pt-3" style={{ paddingBottom: Math.max(12, insets.bottom) }}>
        <Button
          label={isCreate ? t('ingredients.saveIngredient') : t('ingredients.saveChanges')}
          onPress={() => void handleSave()}
          disabled={isSaving || !isReady}
        />
      </View>
      {impactReport ? (
        <PriceChangeImpactSheet
          report={impactReport}
          onClose={() => {
            setImpactReport(null);
            router.back();
          }}
          onReview={() => {
            const { source } = impactReport;
            setImpactReport(null);
            router.push({
              pathname: '/impact',
              params: { kind: source.type, id: source.id },
            });
          }}
          onSelectDish={(recipeId) => {
            setImpactReport(null);
            router.push(`/recipe/${recipeId}`);
          }}
        />
      ) : null}
    </SafeAreaView>
  );
}
