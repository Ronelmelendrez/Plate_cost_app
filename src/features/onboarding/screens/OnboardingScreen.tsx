import { Decimal } from 'decimal.js';
import { useCallback, useMemo, useState } from 'react';
import { SymbolView } from 'expo-symbols';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useTranslation } from 'react-i18next';
import type { ComponentProps } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { calculateChannelPricing } from '@core/costing/channelPricing';
import {
  currencyAffixes,
  currencyFractionDigits,
  formatCurrency,
  formatDecimalInput,
  parseDecimal,
  toMinorUnits,
} from '@core/costing/money';
import { getDefaultRoundingRule } from '@core/costing/suggestedPrice';
import { createDrizzleClient } from '@core/db/client';
import { getRecipeEditorData } from '@features/recipes';
import {
  getAppSettings,
  listSalesChannels,
  saveSettings,
  validateSettingsDraft,
  type AppSettingsDraft,
  type SalesChannelDraft,
} from '@features/settings';
import {
  completeOnboarding,
  ensureStarterChannels,
  saveOnboardingDish,
} from '../data/onboardingRepository';
import {
  getStarterIngredients,
  getStarterTemplates,
  type StarterIngredientTemplate,
  type StarterPackagingTemplate,
} from '../data/starterTemplates';
import { getMarginStatus, type MarginStatus } from '@features/dashboard/domain/marginDashboard';
import { Button, TextField } from '@shared/ui';
import { Colors } from '@shared/theme';

type ChannelSummary = {
  name: string;
  commissionPct: string;
  paymentFeePct: string;
};

interface MarginPreview {
  cost: Decimal;
  price: Decimal;
  profit: Decimal;
  marginPct: Decimal;
  status: MarginStatus;
  channels: ChannelSummary[];
}

const marginStatusStyles = {
  good: {
    color: Colors.light.good,
    icon: { ios: 'checkmark.circle.fill', android: 'check_circle', web: 'check_circle' },
  },
  close: {
    color: Colors.light.warn,
    icon: { ios: 'minus.circle.fill', android: 'remove_circle', web: 'remove_circle' },
  },
  low: {
    color: Colors.light.bad,
    icon: { ios: 'arrow.down.circle.fill', android: 'arrow_downward', web: 'arrow_downward' },
  },
} satisfies Record<
  MarginStatus,
  { color: string; icon: ComponentProps<typeof SymbolView>['name'] }
>;

function formatPercent(value: Decimal, locale: string) {
  return new Intl.NumberFormat(locale, {
    style: 'percent',
    maximumFractionDigits: 0,
  }).format(value.div(100).toNumber());
}

function formatFee(value: string) {
  return new Decimal(value).toString();
}

export default function OnboardingScreen() {
  const sqlite = useSQLiteContext();
  const database = useMemo(() => createDrizzleClient(sqlite), [sqlite]);
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [settings, setSettings] = useState<AppSettingsDraft | null>(null);
  const [channels, setChannels] = useState<SalesChannelDraft[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [formError, setFormError] = useState('');
  const [step, setStep] = useState(0);
  const [selectedIngredientIds, setSelectedIngredientIds] = useState<string[]>([]);
  const [ingredientPrices, setIngredientPrices] = useState<Record<string, string>>({});
  const [ingredientAmounts, setIngredientAmounts] = useState<Record<string, string>>({});
  const [sellingPrice, setSellingPrice] = useState('');
  const [selectedPackagingId, setSelectedPackagingId] = useState<string>();
  const [packagingPrice, setPackagingPrice] = useState('');
  const [savedRecipeId, setSavedRecipeId] = useState<string>();
  const [preview, setPreview] = useState<MarginPreview>();

  const starterTemplates = useMemo(
    () => (settings ? getStarterTemplates(settings.locale) : undefined),
    [settings],
  );
  const starterIngredients = useMemo(
    () => (settings ? getStarterIngredients(settings.locale, settings.unitSystem) : []),
    [settings],
  );
  const selectedIngredients = useMemo(
    () => starterIngredients.filter((item) => selectedIngredientIds.includes(item.id)),
    [selectedIngredientIds, starterIngredients],
  );
  const currencyCode = settings?.currencyCode ?? 'USD';
  const locale = settings?.locale ?? 'en-US';
  const fractionDigits = /^[A-Z]{3}$/.test(currencyCode)
    ? currencyFractionDigits(currencyCode, locale)
    : 2;
  const currencyParts = useMemo(() => {
    if (!settings || !/^[A-Z]{3}$/.test(settings.currencyCode)) {
      return { prefix: '', suffix: settings?.currencyCode ?? '' };
    }
    return currencyAffixes(settings.currencyCode, settings.locale);
  }, [settings]);

  const loadSetup = useCallback(async () => {
    try {
      const currentSettings = await getAppSettings(database);
      const templates = getStarterTemplates(currentSettings.locale);
      await ensureStarterChannels(database, templates.channels);
      const savedChannels = await listSalesChannels(database);
      setSettings({
        locale: currentSettings.locale,
        currencyCode: currentSettings.currencyCode,
        unitSystem: currentSettings.unitSystem,
        cupMl: currentSettings.cupMl,
        tablespoonMl: currentSettings.tablespoonMl,
        pricesIncludeTax: currentSettings.pricesIncludeTax,
        taxPct: currentSettings.taxPct,
        wastePct: currentSettings.wastePct,
        targetMarginPct: currentSettings.targetMarginPct,
        feesOnTaxIncludedPrice: currentSettings.feesOnTaxIncludedPrice,
        roundingRule:
          currentSettings.roundingRule === 'auto'
            ? getDefaultRoundingRule(currentSettings.currencyCode, currentSettings.locale)
            : currentSettings.roundingRule,
      });
      setChannels(
        savedChannels.map((channel) => ({
          id: channel.id,
          name: channel.name,
          commissionPct: channel.commissionPct,
          paymentFeePct: channel.paymentFeePct,
          isDefault: channel.isDefault,
        })),
      );
    } catch (error) {
      console.error('Unable to load onboarding setup.', error);
      setLoadError(true);
    } finally {
      setIsLoading(false);
    }
  }, [database]);

  useFocusEffect(
    useCallback(() => {
      void loadSetup();
    }, [loadSetup]),
  );

  const updateSettings = (patch: Partial<AppSettingsDraft>) => {
    setFormError('');
    setSettings((current) => (current ? { ...current, ...patch } : current));
  };

  const updateCurrency = (value: string) => {
    if (!settings) {
      return;
    }
    const currencyCode = value.toUpperCase().slice(0, 3);
    const hasEnteredPrices =
      Object.values(ingredientPrices).some(Boolean) || Boolean(sellingPrice || packagingPrice);
    updateSettings({
      currencyCode,
      ...(/^[A-Z]{3}$/.test(currencyCode)
        ? { roundingRule: getDefaultRoundingRule(currencyCode, settings.locale) }
        : {}),
    });
    if (currencyCode !== settings.currencyCode && hasEnteredPrices) {
      setIngredientPrices({});
      setSellingPrice('');
      setPackagingPrice('');
      setFormError(t('onboarding.currencyChangeReset'));
    }
  };

  const updateUnitSystem = (unitSystem: AppSettingsDraft['unitSystem']) => {
    if (settings?.unitSystem === unitSystem) {
      return;
    }
    const hasStartedRecipe =
      selectedIngredientIds.length > 0 ||
      Object.values(ingredientPrices).some(Boolean) ||
      Boolean(sellingPrice || packagingPrice);
    updateSettings({ unitSystem });
    if (hasStartedRecipe) {
      setSelectedIngredientIds([]);
      setIngredientPrices({});
      setIngredientAmounts({});
      setSellingPrice('');
      setSelectedPackagingId(undefined);
      setPackagingPrice('');
      setFormError(t('onboarding.unitChangeReset'));
    }
  };

  const handleSetupContinue = async () => {
    if (!settings) {
      return;
    }
    const validationError = validateSettingsDraft(settings, channels);
    if (validationError === 'currency') {
      setFormError(t('onboarding.currencyError'));
      return;
    }
    if (validationError) {
      setFormError(t('onboarding.settingsSaveError'));
      return;
    }
    setIsSaving(true);
    setFormError('');
    try {
      await saveSettings(database, settings, channels);
      setStep(1);
    } catch (error) {
      console.error('Unable to save onboarding settings.', error);
      setFormError(t('onboarding.settingsSaveError'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleSkip = async () => {
    setIsSaving(true);
    setFormError('');
    try {
      await completeOnboarding(database);
      router.replace('/(tabs)');
    } catch (error) {
      console.error('Unable to skip onboarding.', error);
      setFormError(t('onboarding.skipError'));
    } finally {
      setIsSaving(false);
    }
  };

  const toggleIngredient = (ingredient: StarterIngredientTemplate) => {
    setFormError('');
    if (selectedIngredientIds.includes(ingredient.id)) {
      setSelectedIngredientIds((current) => current.filter((id) => id !== ingredient.id));
    } else if (selectedIngredientIds.length === 3) {
      setFormError(t('onboarding.chooseThree'));
      return;
    } else {
      setSelectedIngredientIds((current) => [...current, ingredient.id]);
    }
    setIngredientAmounts((current) => ({
      ...current,
      [ingredient.id]: current[ingredient.id] ?? ingredient.recipeQuantity,
    }));
    setIngredientPrices((current) => ({
      ...current,
      [ingredient.id]: current[ingredient.id] ?? '',
    }));
  };

  const priceInMinorUnits = (value: string) => {
    const parsed = parseDecimal(value, locale);
    return parsed ? toMinorUnits(parsed, fractionDigits) : null;
  };

  const handleIngredientsContinue = () => {
    if (selectedIngredients.length !== 3) {
      setFormError(t('onboarding.chooseThree'));
      return;
    }
    const hasInvalidPrice = selectedIngredients.some((ingredient) => {
      const amount = priceInMinorUnits(ingredientPrices[ingredient.id] ?? '');
      return amount === null || amount <= 0;
    });
    if (hasInvalidPrice) {
      setFormError(t('onboarding.validIngredientPrices'));
      return;
    }
    setFormError('');
    setStep(2);
  };

  const handleDishContinue = async () => {
    if (!settings || !starterTemplates) {
      return;
    }
    const ingredientRows = selectedIngredients.map((template) => {
      const amount = parseDecimal(ingredientAmounts[template.id] ?? '', locale);
      const priceMinor = priceInMinorUnits(ingredientPrices[template.id] ?? '');
      return {
        template,
        priceMinor,
        recipeQuantity: amount?.gt(0) ? amount.toString() : '',
      };
    });
    if (
      ingredientRows.some(
        (row) => row.priceMinor === null || row.priceMinor <= 0 || !row.recipeQuantity,
      )
    ) {
      setFormError(t('onboarding.validRecipeAmounts'));
      return;
    }
    const validIngredientRows = ingredientRows.map((row) => {
      if (row.priceMinor === null || row.priceMinor <= 0 || !row.recipeQuantity) {
        throw new Error('Onboarding ingredient validation did not complete.');
      }
      return { ...row, priceMinor: row.priceMinor };
    });

    const sellingPriceMinor = priceInMinorUnits(sellingPrice);
    if (sellingPriceMinor === null || sellingPriceMinor <= 0) {
      setFormError(t('onboarding.validSellingPrice'));
      return;
    }

    const selectedPackaging: StarterPackagingTemplate | undefined =
      starterTemplates.packaging.find((item) => item.id === selectedPackagingId);
    const packagingCostMinor = selectedPackaging
      ? priceInMinorUnits(packagingPrice)
      : undefined;
    if (selectedPackaging && (packagingCostMinor === null || packagingCostMinor === undefined || packagingCostMinor <= 0)) {
      setFormError(t('onboarding.validPackagingPrice'));
      return;
    }
    const validPackagingCostMinor =
      typeof packagingCostMinor === 'number' && packagingCostMinor > 0
        ? packagingCostMinor
        : undefined;

    setIsSaving(true);
    setFormError('');
    let recipeWasSaved = Boolean(savedRecipeId);
    try {
      let recipeId = savedRecipeId;
      if (!recipeId) {
        recipeId = await saveOnboardingDish(database, starterTemplates.channels, {
          name: t('onboarding.firstDishName'),
          ingredients: validIngredientRows.map((row) => ({
            template: row.template,
            priceMinor: row.priceMinor,
            recipeQuantity: row.recipeQuantity,
          })),
          sellingPriceMinor,
          ...(selectedPackaging && validPackagingCostMinor !== undefined
            ? {
                packaging: {
                  template: selectedPackaging,
                  costMinor: validPackagingCostMinor,
                },
              }
            : {}),
        });
        setSavedRecipeId(recipeId);
        recipeWasSaved = true;
      }
      const recipeData = await getRecipeEditorData(database, recipeId, fractionDigits);
      if (!recipeData) {
        throw new Error('The saved starter dish could not be loaded.');
      }
      const channel = recipeData.channels.find((item) => item.id === 'dine-in');
      const channelPrice = recipeData.channelPrices.find(
        (item) => item.channelId === 'dine-in',
      );
      if (!channel || !channelPrice) {
        throw new Error('The starter dish sales channel could not be loaded.');
      }
      const cost = recipeData.cost.costPerPortion;
      const pricing = calculateChannelPricing({
        costPerPortion: cost,
        priceMinor: channelPrice.priceMinor,
        fractionDigits,
        commissionPct: channel.commissionPct,
        paymentFeePct: channel.paymentFeePct,
        pricesIncludeTax: recipeData.settings.pricesIncludeTax,
        taxPct: recipeData.settings.taxPct,
        feesOnTaxIncludedPrice: recipeData.settings.feesOnTaxIncludedPrice,
      });
      setPreview({
        cost,
        price: pricing.grossPrice,
        profit: pricing.profit,
        marginPct: pricing.marginPct,
        status: getMarginStatus(
          pricing.marginPct,
          new Decimal(recipeData.settings.targetMarginPct),
        ),
        channels: recipeData.channels.map((item) => ({
          name: item.name,
          commissionPct: item.commissionPct,
          paymentFeePct: item.paymentFeePct,
        })),
      });
      setStep(3);
    } catch (error) {
      console.error('Unable to save or calculate the starter dish.', error);
      setFormError(
        recipeWasSaved
          ? t('onboarding.calculationError')
          : t('onboarding.saveDishError'),
      );
    } finally {
      setIsSaving(false);
    }
  };

  const footerLabel =
    step === 0
      ? t('onboarding.setupContinue')
      : step === 1
        ? t('onboarding.ingredientsContinue')
        : step === 2
          ? t('onboarding.dishContinue')
          : t('onboarding.finish');

  const handleContinue = () => {
    if (step === 0) {
      void handleSetupContinue();
    } else if (step === 1) {
      handleIngredientsContinue();
    } else if (step === 2) {
      void handleDishContinue();
    } else {
      router.replace('/(tabs)');
    }
  };

  if (isLoading) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-background">
        <Text className="text-base text-muted">{t('onboarding.loading')}</Text>
      </SafeAreaView>
    );
  }

  if (loadError || !settings || !starterTemplates) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-background px-6">
        <View className="w-full max-w-md gap-4">
          <Text className="text-center text-base text-ink">
            {t('onboarding.loadError')}
          </Text>
          <Button
            label={t('onboarding.retry')}
            onPress={() => {
              setLoadError(false);
              setIsLoading(true);
              void loadSetup();
            }}
          />
        </View>
      </SafeAreaView>
    );
  }

  const statusStyles = preview ? marginStatusStyles[preview.status] : undefined;

  return (
    <SafeAreaView className="flex-1 bg-background">
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 20 }}
        keyboardShouldPersistTaps="handled">
        <View className="mb-6 flex-row items-center justify-between">
          {step > 0 && step < 3 ? (
            <Pressable
              accessibilityRole="button"
              className="min-h-12 justify-center pe-4"
              onPress={() => {
                setFormError('');
                setStep((current) => current - 1);
              }}>
              <Text className="font-semibold text-brand">
                {step === 1 ? t('onboarding.setupBack') : t('onboarding.ingredientsBack')}
              </Text>
            </Pressable>
          ) : (
            <View />
          )}
          {step < 3 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: isSaving }}
              className="min-h-12 justify-center ps-4"
              disabled={isSaving}
              onPress={() => void handleSkip()}>
              <Text className="font-semibold text-brand">{t('onboarding.skip')}</Text>
            </Pressable>
          ) : null}
        </View>

        {step > 0 ? (
          <View
            accessibilityLabel={t('onboarding.progress', { current: step })}
            className="mb-6 flex-row gap-2">
            {[1, 2, 3].map((progressStep) => (
              <View
                key={progressStep}
                className={`h-1.5 flex-1 rounded-full ${
                  progressStep <= step ? 'bg-brand' : 'bg-line'
                }`}
              />
            ))}
          </View>
        ) : null}

        {step === 0 ? (
          <View className="gap-5">
            <View className="gap-2">
              <Text className="text-3xl font-bold text-ink">
                {t('onboarding.setupTitle')}
              </Text>
              <Text className="text-base leading-6 text-muted">
                {t('onboarding.setupDescription')}
              </Text>
            </View>
            <View className="gap-2 rounded-2xl border border-line bg-surface p-4">
              <Text className="text-sm font-semibold text-muted">
                {t('onboarding.language')}
              </Text>
              <Text className="text-base font-semibold text-ink">
                {t('onboarding.languageValue')}
              </Text>
            </View>
            <TextField
              label={t('onboarding.currency')}
              value={settings.currencyCode}
              onChangeText={updateCurrency}
              helperText={t('onboarding.currencyHelp')}
              accessibilityLabel={t('onboarding.currency')}
            />
            <View className="gap-2">
              <Text className="text-sm font-semibold text-ink">
                {t('onboarding.unitSystem')}
              </Text>
              <View className="flex-row gap-3">
                {(['metric', 'us'] as const).map((unitSystem) => {
                  const selected = settings.unitSystem === unitSystem;
                  return (
                    <Pressable
                      key={unitSystem}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: selected }}
                      className={`min-h-12 flex-1 items-center justify-center rounded-xl border px-3 ${
                        selected ? 'border-brand bg-brand/10' : 'border-line bg-surface'
                      }`}
                      onPress={() => updateUnitSystem(unitSystem)}>
                      <Text
                        className={`text-sm font-semibold ${
                          selected ? 'text-brand' : 'text-ink'
                        }`}>
                        {t(`onboarding.${unitSystem}`)}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          </View>
        ) : null}

        {step === 1 ? (
          <View className="gap-5">
            <View className="gap-2">
              <Text className="text-3xl font-bold text-ink">
                {t('onboarding.ingredientTitle')}
              </Text>
              <Text className="text-base leading-6 text-muted">
                {t('onboarding.ingredientDescription')}
              </Text>
              <Text className="text-sm font-semibold text-brand">
                {t('onboarding.ingredientCount', {
                  selected: selectedIngredients.length,
                })}
              </Text>
            </View>
            {starterIngredients.map((ingredient) => {
              const selected = selectedIngredientIds.includes(ingredient.id);
              const priceValue = ingredientPrices[ingredient.id] ?? '';
              return (
                <View
                  key={ingredient.id}
                  className={`gap-3 rounded-2xl border p-4 ${
                    selected ? 'border-brand bg-surface' : 'border-line bg-surface'
                  }`}>
                  <Pressable
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: selected }}
                    className="min-h-12 flex-row items-center justify-between gap-3"
                    onPress={() => toggleIngredient(ingredient)}>
                    <View className="flex-1">
                      <Text className="text-base font-semibold text-ink">
                        {ingredient.name}
                      </Text>
                      <Text className="mt-1 text-sm text-muted">
                        {ingredient.purchaseQuantity} {ingredient.purchaseUnit}
                      </Text>
                    </View>
                    <Text className="text-sm font-semibold text-brand">
                      {selected ? t('onboarding.selected') : t('onboarding.select')}
                    </Text>
                  </Pressable>
                  {selected ? (
                    <TextField
                      label={t('onboarding.ingredientPrice', {
                        quantity: ingredient.purchaseQuantity,
                        unit: ingredient.purchaseUnit,
                      })}
                      value={priceValue}
                      onChangeText={(value) =>
                        setIngredientPrices((current) => ({
                          ...current,
                          [ingredient.id]: value,
                        }))
                      }
                      onBlur={() =>
                        setIngredientPrices((current) => ({
                          ...current,
                          [ingredient.id]: formatDecimalInput(priceValue, locale),
                        }))
                      }
                      keyboardType="decimal-pad"
                      prefix={currencyParts.prefix}
                      suffix={currencyParts.suffix}
                      helperText={t('onboarding.ingredientPriceHelp')}
                    />
                  ) : null}
                </View>
              );
            })}
          </View>
        ) : null}

        {step === 2 ? (
          <View className="gap-5">
            <View className="gap-2">
              <Text className="text-3xl font-bold text-ink">
                {t('onboarding.recipeTitle')}
              </Text>
              <Text className="text-base leading-6 text-muted">
                {t('onboarding.recipeDescription')}
              </Text>
            </View>
            <View className="gap-4 rounded-2xl border border-line bg-surface p-4">
              <Text className="text-base font-semibold text-ink">
                {t('onboarding.firstDishName')}
              </Text>
              {selectedIngredients.map((ingredient) => (
                <TextField
                  key={ingredient.id}
                  label={t('onboarding.quantityPerPlate', {
                    name: ingredient.name,
                    unit: ingredient.recipeUnit,
                  })}
                  value={ingredientAmounts[ingredient.id] ?? ingredient.recipeQuantity}
                  onChangeText={(value) =>
                    setIngredientAmounts((current) => ({
                      ...current,
                      [ingredient.id]: value,
                    }))
                  }
                  onBlur={() =>
                    setIngredientAmounts((current) => ({
                      ...current,
                      [ingredient.id]: formatDecimalInput(
                        current[ingredient.id] ?? ingredient.recipeQuantity,
                        locale,
                      ),
                    }))
                  }
                  keyboardType="decimal-pad"
                  suffix={ingredient.recipeUnit}
                />
              ))}
              <TextField
                label={t('onboarding.sellingPrice')}
                value={sellingPrice}
                onChangeText={setSellingPrice}
                onBlur={() => setSellingPrice(formatDecimalInput(sellingPrice, locale))}
                keyboardType="decimal-pad"
                prefix={currencyParts.prefix}
                suffix={currencyParts.suffix}
              />
            </View>
            <View className="gap-3 rounded-2xl border border-line bg-surface p-4">
              <Text className="text-base font-semibold text-ink">
                {t('onboarding.packaging')}
              </Text>
              <View className="flex-row flex-wrap gap-2">
                <Pressable
                  accessibilityRole="radio"
                  accessibilityState={{ checked: !selectedPackagingId }}
                  className={`min-h-11 justify-center rounded-xl border px-3 ${
                    !selectedPackagingId ? 'border-brand bg-brand/10' : 'border-line'
                  }`}
                  onPress={() => {
                    setSelectedPackagingId(undefined);
                    setPackagingPrice('');
                  }}>
                  <Text className="text-sm font-semibold text-ink">
                    {t('onboarding.noPackaging')}
                  </Text>
                </Pressable>
                {starterTemplates.packaging.map((item) => {
                  const selected = selectedPackagingId === item.id;
                  return (
                    <Pressable
                      key={item.id}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: selected }}
                      className={`min-h-11 justify-center rounded-xl border px-3 ${
                        selected ? 'border-brand bg-brand/10' : 'border-line'
                      }`}
                      onPress={() => {
                        setSelectedPackagingId(item.id);
                        setFormError('');
                      }}>
                      <Text className="text-sm font-semibold text-ink">{item.name}</Text>
                    </Pressable>
                  );
                })}
              </View>
              {selectedPackagingId ? (
                <TextField
                  label={t('onboarding.packagingPrice', {
                    quantity: 1,
                    unit: t('onboarding.piece'),
                  })}
                  value={packagingPrice}
                  onChangeText={setPackagingPrice}
                  onBlur={() =>
                    setPackagingPrice(formatDecimalInput(packagingPrice, locale))
                  }
                  keyboardType="decimal-pad"
                  prefix={currencyParts.prefix}
                  suffix={currencyParts.suffix}
                  helperText={t('onboarding.packagingHelp')}
                />
              ) : null}
            </View>
          </View>
        ) : null}

        {step === 3 && preview && statusStyles ? (
          <View className="gap-5">
            <View className="gap-2">
              <Text className="text-3xl font-bold text-ink">
                {t('onboarding.resultTitle')}
              </Text>
              <Text className="text-base leading-6 text-muted">
                {t('onboarding.resultDescription')}
              </Text>
            </View>
            <View className="gap-4 rounded-2xl border border-line bg-surface p-5">
              <View className="flex-row items-center justify-between gap-3">
                <Text className="text-base text-muted">
                  {t('onboarding.margin')}
                </Text>
                <View className="flex-row items-center gap-2">
                  <SymbolView
                    name={statusStyles.icon}
                    tintColor={statusStyles.color}
                    size={22}
                  />
                  <Text style={{ color: statusStyles.color }} className="font-semibold">
                    {t(`dashboard.status.${preview.status}`)}
                  </Text>
                  <Text className="text-xl font-bold text-ink">
                    {formatPercent(preview.marginPct, locale)}
                  </Text>
                </View>
              </View>
              <View className="h-px bg-line" />
              <ResultRow
                label={t('onboarding.costPerPlate')}
                value={formatCurrency(preview.cost, currencyCode, locale)}
              />
              <ResultRow
                label={t('onboarding.sellingPriceResult')}
                value={formatCurrency(preview.price, currencyCode, locale)}
              />
              <ResultRow
                label={t('onboarding.profitPerPlate')}
                value={formatCurrency(preview.profit, currencyCode, locale)}
              />
            </View>
            <View className="gap-3 rounded-2xl border border-line bg-surface p-4">
              <Text className="text-base font-semibold text-ink">
                {t('onboarding.channelRates')}
              </Text>
              <Text className="text-sm leading-5 text-muted">
                {t('onboarding.channelRatesHelp')}
              </Text>
              {preview.channels.map((channel) => (
                <View
                  key={channel.name}
                  className="flex-row items-center justify-between gap-3 border-t border-line pt-3">
                  <Text className="flex-1 text-sm font-medium text-ink">{channel.name}</Text>
                  <Text className="text-right text-sm text-muted">
                    {t('onboarding.channelFees', {
                      commission: formatFee(channel.commissionPct),
                      payment: formatFee(channel.paymentFeePct),
                    })}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {formError ? (
          <Text accessibilityRole="alert" className="mt-5 text-sm text-bad">
            {formError}
          </Text>
        ) : null}
        {step === 1 && selectedIngredients.length < 3 ? (
          <Text className="mt-4 text-sm text-muted">
            {t('onboarding.chooseThree')}
          </Text>
        ) : null}
      </ScrollView>

      <View
        className="border-t border-line bg-background px-5 pt-4"
        style={{ paddingBottom: Math.max(insets.bottom, 12) }}>
        <Button
          label={footerLabel}
          disabled={isSaving}
          onPress={handleContinue}
        />
      </View>
    </SafeAreaView>
  );
}

function ResultRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row items-center justify-between gap-4">
      <Text className="text-base text-muted">{label}</Text>
      <Text className="text-base font-semibold text-ink">{value}</Text>
    </View>
  );
}
