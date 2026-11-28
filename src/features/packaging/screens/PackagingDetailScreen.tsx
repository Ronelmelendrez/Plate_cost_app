import { Decimal } from 'decimal.js';
import { getLocales } from 'expo-localization';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  currencyAffixes,
  currencyFractionDigits,
  formatDecimalInput,
  formatUnitCost,
  parseDecimal,
  toMinorUnits,
} from '@core/costing/money';
import { createDrizzleClient } from '@core/db/client';
import {
  getPriceChangeImpact,
  type PriceChangeImpactReport,
} from '@features/impact/data/impactRepository';
import { PriceChangeImpactSheet } from '@features/impact/components/PriceChangeImpactSheet';
import {
  getAppSettings,
  type AppSettings,
} from '@features/settings/data/settingsRepository';
import {
  getPackagingItem,
  savePackagingItem,
} from '@features/packaging/data/packagingRepository';
import type { PackagingItem } from '@features/packaging/types';
import { Button, TextField } from '@shared/ui';
import { HERO_GRADIENT, HERO_TOP } from '@shared/theme';

const localeInfo = getLocales()[0];
const deviceLocale = localeInfo?.languageTag ?? 'en-US';
const deviceCurrency = localeInfo?.currencyCode ?? 'USD';

export default function PackagingDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const isCreate = id === 'new';
  const sqlite = useSQLiteContext();
  const database = useMemo(() => createDrizzleClient(sqlite), [sqlite]);
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [item, setItem] = useState<PackagingItem | null>(null);
  const [name, setName] = useState('');
  const [packPrice, setPackPrice] = useState('');
  const [piecesPerPack, setPiecesPerPack] = useState('1');
  const [note, setNote] = useState('');
  const [formError, setFormError] = useState('');
  const [nameError, setNameError] = useState('');
  const [priceError, setPriceError] = useState('');
  const [piecesError, setPiecesError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [impactReport, setImpactReport] = useState<PriceChangeImpactReport | null>(null);

  const locale = settings?.locale ?? deviceLocale;
  const currency = settings?.currencyCode ?? deviceCurrency;
  const fractionDigits = currencyFractionDigits(currency, locale);
  const affixes = currencyAffixes(currency, locale);
  const packPriceValue = parseDecimal(packPrice, locale);
  const piecesValue = parseDecimal(piecesPerPack, locale);
  const packPriceMinor = packPriceValue?.gt(0)
    ? toMinorUnits(packPriceValue, fractionDigits)
    : null;
  const costPerPiece =
    packPriceMinor !== null && piecesValue?.isInteger() && piecesValue.gt(0)
      ? new Decimal(packPriceMinor)
          .div(new Decimal(10).pow(fractionDigits))
          .div(piecesValue)
      : undefined;

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const currentSettings = await getAppSettings(database);
        const currentItem = isCreate ? undefined : await getPackagingItem(database, id);
        if (!active) {
          return;
        }
        setSettings(currentSettings);
        if (!isCreate) {
          if (!currentItem) {
            setFormError(t('packaging.notFound'));
            return;
          }
          setItem(currentItem);
          setName(currentItem.name);
          setPackPrice(
            new Decimal(currentItem.packPriceMinor)
              .div(new Decimal(10).pow(currencyFractionDigits(
                currentSettings.currencyCode,
                currentSettings.locale,
              )))
              .toFixed(currencyFractionDigits(
                currentSettings.currencyCode,
                currentSettings.locale,
              )),
          );
          setPiecesPerPack(String(currentItem.piecesPerPack));
          setNote(currentItem.note ?? '');
        }
        setIsReady(true);
      } catch (loadError) {
        console.error('Unable to load packaging item.', loadError);
        if (active) {
          setFormError(t('packaging.loadError'));
        }
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [database, id, isCreate, t]);

  const handleSave = async () => {
    const nextName = name.trim();
    const price = parseDecimal(packPrice, locale);
    const pieces = parseDecimal(piecesPerPack, locale);
    const nextPriceMinor = price?.gt(0) ? toMinorUnits(price, fractionDigits) : null;
    let invalid = false;
    if (!nextName) {
      setNameError(t('packaging.nameRequired'));
      invalid = true;
    } else {
      setNameError('');
    }
    if (!price?.gt(0)) {
      setPriceError(t('packaging.priceRequired'));
      invalid = true;
    } else if (nextPriceMinor === null) {
      setPriceError(t('ingredients.pricePrecision', { digits: fractionDigits, currency }));
      invalid = true;
    } else {
      setPriceError('');
    }
    if (!pieces?.isInteger() || !pieces.gt(0) || !Number.isSafeInteger(pieces.toNumber())) {
      setPiecesError(t('packaging.piecesRequired'));
      invalid = true;
    } else {
      setPiecesError('');
    }
    if (invalid || nextPriceMinor === null || !pieces) {
      return;
    }

    setIsSaving(true);
    setFormError('');
    try {
      const saved = await savePackagingItem(database, {
        id: isCreate ? undefined : id,
        name: nextName,
        packPriceMinor: nextPriceMinor,
        piecesPerPack: pieces.toNumber(),
        note: note.trim() || null,
      });
      if (saved.priceChanged) {
        try {
          const report = await getPriceChangeImpact(database, {
            type: 'packaging',
            id: saved.id,
          });
          if (report.dishes.length > 0) {
            setImpactReport(report);
            return;
          }
        } catch (impactError) {
          console.error('Unable to calculate packaging price-change impact.', impactError);
          setFormError(t('impact.savedButImpactError'));
          return;
        }
      }
      router.back();
    } catch (saveError) {
      console.error('Unable to save packaging item.', saveError);
      setFormError(t('packaging.saveError'));
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
            accessibilityLabel={t('recipes.close')}
            onPress={() => router.back()}
            className="h-11 w-11 items-center justify-center rounded-full border border-white/30 bg-white/15">
            <SymbolView
              name={{ ios: 'chevron.left', android: 'arrow_back', web: 'arrow_back' }}
              tintColor="#FFFFFF"
              size={22}
            />
          </Pressable>
          <Text
            accessibilityRole="header"
            numberOfLines={1}
            className="flex-1 font-inter-extrabold text-[22px] text-white">
            {isCreate ? t('packaging.addItem') : t('packaging.editItem')}
          </Text>
        </View>
      </LinearGradient>

      <ScrollView
        className="flex-1 bg-bg"
        contentContainerStyle={{ gap: 18, padding: 16, paddingBottom: 24 }}
        keyboardShouldPersistTaps="handled">
        {formError ? (
          <Text accessibilityRole="alert" className="font-inter text-sm text-bad">
            {formError}
          </Text>
        ) : null}
        <TextField
          label={t('packaging.name')}
          value={name}
          onChangeText={(value) => {
            setName(value);
            setNameError('');
          }}
          error={nameError}
        />
        <TextField
          label={t('packaging.packPrice')}
          value={packPrice}
          onChangeText={(value) => {
            setPackPrice(value);
            setPriceError('');
          }}
          onBlur={() => setPackPrice(formatDecimalInput(packPrice, locale))}
          keyboardType="decimal-pad"
          prefix={affixes.prefix}
          suffix={affixes.suffix}
          error={priceError}
        />
        <TextField
          label={t('packaging.piecesPerPack')}
          value={piecesPerPack}
          onChangeText={(value) => {
            setPiecesPerPack(value);
            setPiecesError('');
          }}
          keyboardType="decimal-pad"
          error={piecesError}
        />
        <View className="gap-2">
          <Text className="font-inter-semibold text-sm text-ink">{t('packaging.note')}</Text>
          <TextInput
            accessibilityLabel={t('packaging.note')}
            value={note}
            onChangeText={setNote}
            multiline
            textAlignVertical="top"
            className="min-h-24 rounded-xl border border-line bg-surface px-3 py-3 font-inter text-base text-ink"
          />
        </View>
        {costPerPiece ? (
          <View className="rounded-2xl border border-line bg-surface p-4">
            <Text className="font-inter text-sm text-muted">{t('packaging.costPerPieceLabel')}</Text>
            <Text className="mt-1 font-inter-bold text-lg text-ink">
              {t('packaging.costPerPiece', {
                cost: formatUnitCost(costPerPiece, currency, locale),
              })}
            </Text>
          </View>
        ) : null}
      </ScrollView>

      <View
        className="border-t border-line bg-bg px-4 pt-3"
        style={{ paddingBottom: Math.max(12, insets.bottom) }}>
        <Button
          label={t(isCreate ? 'packaging.addItem' : 'packaging.saveChanges')}
          onPress={() => void handleSave()}
          disabled={!isReady || isSaving || (!isCreate && !item)}
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
            setImpactReport(null);
            router.push({
              pathname: '/impact',
              params: { kind: 'packaging', id: impactReport.source.id },
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
