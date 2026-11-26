import Slider from '@react-native-community/slider';
import { Decimal } from 'decimal.js';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { calculateChannelPricing } from '@core/costing/channelPricing';
import {
  currencyFractionDigits,
  formatCurrency,
} from '@core/costing/money';
import {
  calculateSuggestedPrice,
  getDefaultRoundingRule,
} from '@core/costing/suggestedPrice';
import { createDrizzleClient } from '@core/db/client';
import {
  getRecipeEditorData,
  saveRecipeChannelPrice,
} from '@features/recipes';
import { getAppSettings, type SalesChannel } from '@features/settings';
import { Button } from '@shared/ui';
import { Colors } from '@shared/theme';

type RecipePricingData = NonNullable<Awaited<ReturnType<typeof getRecipeEditorData>>>;

function getSliderStep(rangeMinor: number, fractionDigits: number) {
  const rawStep = Math.max(1, Math.ceil(rangeMinor / 60));
  const minimumStep = fractionDigits === 0 ? 10 : 1;
  const normalizedStep = Math.max(rawStep, minimumStep);
  const magnitude = 10 ** Math.floor(Math.log10(normalizedStep));

  for (const multiplier of [1, 2, 5, 10]) {
    const step = multiplier * magnitude;
    if (step >= normalizedStep) {
      return Math.min(step, rangeMinor);
    }
  }
  return Math.min(10 * magnitude, rangeMinor);
}

function minorUnitsAsDecimal(priceMinor: number, fractionDigits: number) {
  return new Decimal(priceMinor).div(new Decimal(10).pow(fractionDigits));
}

function getPriceRange(
  costPerPortion: Decimal,
  fractionDigits: number,
  prices: number[],
  suggestedPriceMinor: number | undefined,
) {
  const scale = new Decimal(10).pow(fractionDigits);
  const costMinorDecimal = costPerPortion.mul(scale).ceil();
  const costMinor = costMinorDecimal.toNumber();
  if (!Number.isSafeInteger(costMinor) || costMinor < 0) {
    return undefined;
  }

  const positivePrices = prices.filter((price) => Number.isSafeInteger(price) && price > 0);
  const minimumValue = Math.max(
    1,
    Math.min(costMinor || 1, ...positivePrices),
  );
  const suggested = suggestedPriceMinor ?? 0;
  const maximumValue = Math.max(
    minimumValue + 1,
    costMinor * 3,
    suggested,
    ...positivePrices,
  );
  if (!Number.isSafeInteger(maximumValue)) {
    return undefined;
  }
  return {
    minimumValue,
    maximumValue,
    step: getSliderStep(maximumValue - minimumValue, fractionDigits),
  };
}

export default function PriceWhatIfScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const sqlite = useSQLiteContext();
  const database = useMemo(() => createDrizzleClient(sqlite), [sqlite]);
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [data, setData] = useState<RecipePricingData | null>(null);
  const [channelId, setChannelId] = useState('');
  const [priceMinor, setPriceMinor] = useState<number | null>(null);
  const [sliderVersion, setSliderVersion] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [screenError, setScreenError] = useState('');

  const loadData = useCallback(async () => {
    setLoadError('');
    setScreenError('');
    setIsLoading(true);
    try {
      const settings = await getAppSettings(database);
      const currentFractionDigits = currencyFractionDigits(
        settings.currencyCode,
        settings.locale,
      );
      const recipeData = await getRecipeEditorData(database, id, currentFractionDigits);
      if (!recipeData || recipeData.recipe.isSubRecipe) {
        setData(null);
        setLoadError(t('pricing.recipeUnavailable'));
        return;
      }

      const selectedChannel =
        recipeData.channels.find((channel) => channel.id === 'dine-in') ??
        recipeData.channels[0];
      const storedPrice = selectedChannel
        ? recipeData.channelPrices.find(
            (price) => price.channelId === selectedChannel.id,
          )?.priceMinor
        : undefined;
      const costMinor = recipeData.cost.costPerPortion
        .mul(new Decimal(10).pow(currentFractionDigits))
        .ceil()
        .toNumber();
      const initialPrice =
        storedPrice ?? (Number.isSafeInteger(costMinor) ? Math.max(1, costMinor) : null);
      setData(recipeData);
      setChannelId(selectedChannel?.id ?? '');
      setPriceMinor(initialPrice);
      setSliderVersion((version) => version + 1);
      setIsSaved(false);
    } catch (error) {
      console.error('Unable to load what-if pricing data.', error);
      setData(null);
      setLoadError(t('pricing.loadError'));
    } finally {
      setIsLoading(false);
    }
  }, [database, id, t]);

  useFocusEffect(
    useCallback(() => {
      void loadData();
    }, [loadData]),
  );

  const settings = data?.settings;
  const locale = settings?.locale ?? 'en-US';
  const currency = settings?.currencyCode ?? 'USD';
  const fractionDigits = currencyFractionDigits(currency, locale);
  const channel = data?.channels.find((item) => item.id === channelId);
  const roundingRule =
    settings?.roundingRule === 'auto' || !settings
      ? getDefaultRoundingRule(currency, locale)
      : settings.roundingRule;

  const suggestedPrice = useMemo(() => {
    if (!data || !channel) {
      return undefined;
    }
    return calculateSuggestedPrice({
      costPerPortion: data.cost.costPerPortion,
      targetMarginPct: data.settings.targetMarginPct,
      commissionPct: channel.commissionPct,
      paymentFeePct: channel.paymentFeePct,
      taxPct: data.settings.taxPct,
      fractionDigits,
      pricesIncludeTax: data.settings.pricesIncludeTax,
      feesOnTaxIncludedPrice: data.settings.feesOnTaxIncludedPrice,
      roundingRule,
    });
  }, [channel, data, fractionDigits, roundingRule]);

  const range = useMemo(() => {
    if (!data) {
      return undefined;
    }
    return getPriceRange(
      data.cost.costPerPortion,
      fractionDigits,
      [
        ...data.channelPrices.map((price) => price.priceMinor),
        ...(priceMinor === null ? [] : [priceMinor]),
      ],
      suggestedPrice?.kind === 'suggested' ? suggestedPrice.priceMinor : undefined,
    );
  }, [data, fractionDigits, priceMinor, suggestedPrice]);

  let pricing: ReturnType<typeof calculateChannelPricing> | undefined;
  let calculationFailed = false;
  if (data && channel && priceMinor !== null) {
    try {
      pricing = calculateChannelPricing({
        costPerPortion: data.cost.costPerPortion,
        priceMinor,
        fractionDigits,
        commissionPct: channel.commissionPct,
        paymentFeePct: channel.paymentFeePct,
        pricesIncludeTax: data.settings.pricesIncludeTax,
        taxPct: data.settings.taxPct,
        feesOnTaxIncludedPrice: data.settings.feesOnTaxIncludedPrice,
      });
    } catch (error) {
      console.error('Unable to calculate what-if pricing.', error);
      calculationFailed = true;
    }
  }

  const marginStatus =
    pricing && settings
      ? pricing.marginPct.gte(settings.targetMarginPct)
        ? 'good'
        : pricing.marginPct.gte(new Decimal(settings.targetMarginPct).minus(5))
          ? 'close'
          : 'low'
      : undefined;

  const selectChannel = (nextChannel: SalesChannel) => {
    const nextPrice = data?.channelPrices.find(
      (price) => price.channelId === nextChannel.id,
    )?.priceMinor;
    const costMinor = data?.cost.costPerPortion
      .mul(new Decimal(10).pow(fractionDigits))
      .ceil()
      .toNumber();
    setChannelId(nextChannel.id);
    setPriceMinor(
      nextPrice ??
        (costMinor !== undefined && Number.isSafeInteger(costMinor)
          ? Math.max(1, costMinor)
          : null),
    );
    setSliderVersion((version) => version + 1);
    setIsSaved(false);
    setScreenError('');
  };

  const useSuggestedPrice = () => {
    if (suggestedPrice?.kind !== 'suggested') {
      return;
    }
    setPriceMinor(suggestedPrice.priceMinor);
    setSliderVersion((version) => version + 1);
    setIsSaved(false);
    setScreenError('');
  };

  const savePrice = async () => {
    if (!data || !channel || priceMinor === null) {
      return;
    }
    setIsSaving(true);
    setScreenError('');
    setIsSaved(false);
    try {
      await saveRecipeChannelPrice(database, data.recipe.id, channel.id, priceMinor);
      setIsSaved(true);
    } catch (error) {
      console.error('Unable to save the recipe channel price.', error);
      setScreenError(t('pricing.saveError'));
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading && !data) {
    return <SafeAreaView edges={['top']} className="flex-1 bg-bg" />;
  }

  if (loadError || !data) {
    return (
      <SafeAreaView edges={['top']} className="flex-1 justify-center gap-3 bg-bg px-4">
        <Text accessibilityRole="alert" className="text-base text-bad">
          {loadError || t('pricing.loadError')}
        </Text>
        <Button label={t('pricing.retry')} onPress={() => void loadData()} />
      </SafeAreaView>
    );
  }

  const suggestedPriceLabel =
    suggestedPrice?.kind === 'suggested'
      ? formatCurrency(suggestedPrice.price, currency, locale)
      : '';
  const currentPrice = priceMinor === null
    ? new Decimal(0)
    : minorUnitsAsDecimal(priceMinor, fractionDigits);

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-bg">
      <ScrollView
        className="flex-1"
        contentContainerClassName="gap-5 px-4 pb-6 pt-2"
        keyboardShouldPersistTaps="handled">
        <View className="gap-1">
          <Text className="text-xl font-semibold text-ink">{t('pricing.title')}</Text>
          <Text className="text-base text-muted">{data.recipe.name}</Text>
        </View>

        <View className="gap-2">
          <Text className="text-base font-semibold text-ink">
            {t('pricing.salesChannel')}
          </Text>
          {data.channels.length > 0 ? (
            <View className="flex-row flex-wrap gap-2">
              {data.channels.map((item) => (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected: item.id === channelId }}
                  accessibilityLabel={t('pricing.selectChannel', { name: item.name })}
                  onPress={() => selectChannel(item)}
                  key={item.id}
                  className={`min-h-12 items-center justify-center rounded-full border px-4 ${
                    item.id === channelId
                      ? 'border-brand bg-surface'
                      : 'border-line bg-surface'
                  }`}>
                  <Text className="text-base text-ink">{item.name}</Text>
                </Pressable>
              ))}
            </View>
          ) : (
            <Text className="text-base text-muted">{t('pricing.noChannels')}</Text>
          )}
        </View>

        <View className="gap-2 rounded-xl border border-line bg-surface p-4">
          <Text className="text-sm text-muted">{t('pricing.sellingPrice')}</Text>
          <Text className="text-2xl font-semibold text-ink">
            {formatCurrency(currentPrice, currency, locale)}
          </Text>
          {range && priceMinor !== null ? (
            <Slider
              key={`${channelId}-${sliderVersion}`}
              accessibilityLabel={t('pricing.priceSlider')}
              accessibilityValue={{
                min: minorUnitsAsDecimal(
                  range.minimumValue,
                  fractionDigits,
                ).toNumber(),
                max: minorUnitsAsDecimal(
                  range.maximumValue,
                  fractionDigits,
                ).toNumber(),
                now: currentPrice.toNumber(),
              }}
              minimumValue={range.minimumValue}
              maximumValue={range.maximumValue}
              step={range.step}
              value={Math.min(
                range.maximumValue,
                Math.max(range.minimumValue, priceMinor),
              )}
              minimumTrackTintColor={Colors.light.tint}
              maximumTrackTintColor={Colors.light.line}
              thumbTintColor={Colors.light.tint}
              thumbSize={28}
              style={{ height: 48 }}
              onValueChange={(value) => {
                setPriceMinor(Math.round(value));
                setIsSaved(false);
              }}
            />
          ) : null}
          {range ? (
            <View className="flex-row justify-between">
              <Text className="text-sm text-muted">
                {formatCurrency(
                  minorUnitsAsDecimal(range.minimumValue, fractionDigits),
                  currency,
                  locale,
                )}
              </Text>
              <Text className="text-sm text-muted">
                {formatCurrency(
                  minorUnitsAsDecimal(range.maximumValue, fractionDigits),
                  currency,
                  locale,
                )}
              </Text>
            </View>
          ) : null}
        </View>

        {channel ? (
          <View className="gap-3 rounded-xl border border-line bg-surface p-4">
            <View className="flex-row justify-between gap-3">
              <Text className="flex-1 text-base text-muted">{t('pricing.costPerPlate')}</Text>
              <Text className="text-base font-semibold text-ink">
                {formatCurrency(data.cost.costPerPortion, currency, locale)}
              </Text>
            </View>
            <View className="flex-row justify-between gap-3">
              <Text className="flex-1 text-base text-muted">{t('pricing.channelFees')}</Text>
              <Text className="text-base font-semibold text-ink">
                {pricing
                  ? formatCurrency(pricing.fees, currency, locale)
                  : formatCurrency(new Decimal(0), currency, locale)}
              </Text>
            </View>
            <View className="flex-row justify-between gap-3 border-t border-line pt-3">
              <Text className="flex-1 text-base font-semibold text-ink">
                {t('pricing.profitPerPlate')}
              </Text>
              <Text
                className={`text-base font-semibold ${
                  pricing && pricing.profit.isNegative() ? 'text-bad' : 'text-ink'
                }`}>
                {pricing
                  ? formatCurrency(pricing.profit, currency, locale)
                  : formatCurrency(new Decimal(0), currency, locale)}
              </Text>
            </View>
            {pricing && marginStatus ? (
              <View className="flex-row justify-between gap-3">
                <Text className="flex-1 text-base text-muted">{t('pricing.margin')}</Text>
                <Text
                  accessibilityLabel={t('pricing.marginStatus', {
                    margin: new Intl.NumberFormat(locale, {
                      maximumFractionDigits: 1,
                    }).format(pricing.marginPct.toNumber()),
                    status: t(`dashboard.status.${marginStatus}`),
                  })}
                  className={`text-base font-semibold ${
                    marginStatus === 'good'
                      ? 'text-good'
                      : marginStatus === 'close'
                        ? 'text-warn'
                        : 'text-bad'
                  }`}>
                  {new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(
                    pricing.marginPct.toNumber(),
                  )}
                  {'% · '}
                  {t(`dashboard.status.${marginStatus}`)}
                </Text>
              </View>
            ) : null}
            {calculationFailed ? (
              <Text accessibilityRole="alert" className="text-sm text-bad">
                {t('pricing.calculationError')}
              </Text>
            ) : null}
          </View>
        ) : null}

        <View className="gap-2">
          <Button
            label={
              suggestedPrice?.kind === 'suggested'
                ? t('pricing.suggestPriceWithTarget', {
                    target: data.settings.targetMarginPct,
                  })
                : t('pricing.suggestPrice')
            }
            variant="secondary"
            disabled={!channel || suggestedPrice?.kind !== 'suggested'}
            onPress={useSuggestedPrice}
          />
          {suggestedPrice?.kind === 'suggested' ? (
            <Text className="text-center text-base font-semibold text-ink">
              {t('pricing.suggestedPriceValue', { price: suggestedPriceLabel })}
            </Text>
          ) : suggestedPrice?.kind === 'impossible' ? (
            <Text accessibilityRole="alert" className="text-base text-bad">
              {t('pricing.impossibleTarget', {
                channel: channel?.name ?? '',
                target: data.settings.targetMarginPct,
              })}
            </Text>
          ) : suggestedPrice?.kind === 'unrepresentable' ? (
            <Text accessibilityRole="alert" className="text-base text-bad">
              {t('pricing.unrepresentable')}
            </Text>
          ) : null}
        </View>

        {screenError ? (
          <Text accessibilityRole="alert" className="text-base text-bad">
            {screenError}
          </Text>
        ) : null}
        {isSaved ? (
          <Text accessibilityRole="summary" className="text-sm font-semibold text-good">
            {t('pricing.saved')}
          </Text>
        ) : null}
      </ScrollView>

      <View
        className="border-t border-line bg-bg px-4 pt-3"
        style={{ paddingBottom: Math.max(12, insets.bottom) }}>
        <Button
          label={t('pricing.useThisPrice')}
          onPress={() => void savePrice()}
          disabled={!channel || priceMinor === null || isSaving || calculationFailed}
        />
      </View>
    </SafeAreaView>
  );
}
