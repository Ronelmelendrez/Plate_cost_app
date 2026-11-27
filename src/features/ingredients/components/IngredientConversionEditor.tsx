import { Pressable, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import {
  BASE_UNITS,
  CONVERSION_UNITS,
  type BaseUnit,
  type ConversionUnit,
} from '@core/costing/units';
import { formatDecimalInput } from '@core/costing/money';
import { TextField } from '@shared/ui';

export interface ConversionDraft {
  fromUnit: ConversionUnit;
  baseQuantity: string;
  baseUnit: BaseUnit;
}

interface IngredientConversionEditorProps {
  conversions: ConversionDraft[];
  onChange: (conversions: ConversionDraft[]) => void;
  locale: string;
  error?: string;
}

export function IngredientConversionEditor({
  conversions,
  onChange,
  locale,
  error,
}: IngredientConversionEditorProps) {
  const { t } = useTranslation();

  const updateConversion = (index: number, patch: Partial<ConversionDraft>) => {
    onChange(
      conversions.map((conversion, rowIndex) =>
        rowIndex === index ? { ...conversion, ...patch } : conversion,
      ),
    );
  };

  return (
    <View className="gap-4">
      <View>
        <Text className="text-base font-inter-semibold text-ink">
          {t('ingredients.conversions')}
        </Text>
        <Text className="mt-1 font-inter text-sm text-muted">{t('ingredients.conversionHelp')}</Text>
      </View>
      {conversions.map((conversion, index) => (
        <View className="gap-3 border-b border-line pb-4" key={`${index}-${conversion.fromUnit}`}>
          <Text className="text-sm font-inter-semibold text-ink">
            {t('ingredients.conversionUnit')}
          </Text>
          <View className="flex-row flex-wrap gap-2">
            {CONVERSION_UNITS.map((unit) => (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: conversion.fromUnit === unit }}
                accessibilityLabel={t('ingredients.selectConversionUnit', {
                  unit: t(`units.${unit}`),
                })}
                className={`min-h-12 min-w-12 items-center justify-center rounded-xl border px-3 ${
                  conversion.fromUnit === unit
                    ? 'border-ink bg-surface'
                    : 'border-line bg-surface'
                }`}
                key={unit}
                onPress={() => updateConversion(index, { fromUnit: unit })}>
                <Text className="font-inter text-base text-ink">{t(`units.${unit}`)}</Text>
              </Pressable>
            ))}
          </View>
          <View className="flex-row items-end gap-3">
            <View className="flex-1">
              <TextField
                label={t('ingredients.baseQuantity')}
                value={conversion.baseQuantity}
                onChangeText={(baseQuantity) => updateConversion(index, { baseQuantity })}
                onBlur={() =>
                  updateConversion(index, {
                    baseQuantity: formatDecimalInput(conversion.baseQuantity, locale),
                  })
                }
                keyboardType="decimal-pad"
                suffix={t(`units.${conversion.baseUnit}`)}
                accessibilityLabel={t('ingredients.conversionQuantity', {
                  unit: t(`units.${conversion.fromUnit}`),
                })}
              />
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('ingredients.deleteConversion')}
              onPress={() => onChange(conversions.filter((_, rowIndex) => rowIndex !== index))}
              className="mb-1 min-h-12 min-w-12 items-center justify-center rounded-xl border border-line bg-surface">
              <Text className="text-base font-inter-semibold text-ink">−</Text>
            </Pressable>
          </View>
          <Text className="text-sm font-inter-semibold text-ink">{t('ingredients.baseUnit')}</Text>
          <View className="flex-row gap-2">
            {BASE_UNITS.map((unit) => (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: conversion.baseUnit === unit }}
                accessibilityLabel={t('ingredients.selectBaseUnit', {
                  unit: t(`units.${unit}`),
                })}
                className={`min-h-12 min-w-12 items-center justify-center rounded-xl border px-3 ${
                  conversion.baseUnit === unit
                    ? 'border-ink bg-surface'
                    : 'border-line bg-surface'
                }`}
                key={unit}
                onPress={() => updateConversion(index, { baseUnit: unit })}>
                <Text className="font-inter text-base text-ink">{t(`units.${unit}`)}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ))}
      {error ? (
        <Text accessibilityRole="alert" className="font-inter text-sm text-bad">
          {error}
        </Text>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('ingredients.addConversion')}
        onPress={() =>
          onChange([
            ...conversions,
            { fromUnit: 'cup', baseQuantity: '', baseUnit: 'g' },
          ])
        }
        className="min-h-12 items-center justify-center rounded-xl border border-line bg-surface px-4">
        <Text className="text-base font-inter-semibold text-ink">{t('ingredients.addConversion')}</Text>
      </Pressable>
    </View>
  );
}
