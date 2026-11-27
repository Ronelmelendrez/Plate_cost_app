import { Decimal } from 'decimal.js';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { currencyFractionDigits, formatCurrency, formatDecimalInput, parseDecimal } from '@core/costing/money';
import type { SalesChannel } from '@features/settings';
import { BottomSheet, Button, TextField } from '@shared/ui';
import { Colors } from '@shared/theme';

import { ChannelChips } from './ChannelChips';
import type { PackagingItem, RecipePackagingDraft } from '../types';

export function PackagingPicker({
  visible,
  items,
  channels,
  currency,
  locale,
  initialLine,
  onClose,
  onAdd,
}: {
  visible: boolean;
  items: PackagingItem[];
  channels: SalesChannel[];
  currency: string;
  locale: string;
  initialLine?: RecipePackagingDraft;
  onClose: () => void;
  onAdd: (line: RecipePackagingDraft) => void;
}) {
  const { t } = useTranslation();
  const fractionDigits = currencyFractionDigits(currency, locale);
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState(initialLine?.packagingId ?? '');
  const [quantity, setQuantity] = useState(initialLine?.quantityPerPortion ?? '1');
  const [appliesTo, setAppliesTo] = useState<'all' | 'selected'>(
    initialLine?.appliesTo ?? 'all',
  );
  const [channelIds, setChannelIds] = useState(initialLine?.channelIds ?? []);
  const [error, setError] = useState('');

  const visibleItems = useMemo(
    () =>
      items.filter((item) =>
        item.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
      ),
    [items, query],
  );
  const selected = items.find((item) => item.id === selectedId);

  const handleSave = () => {
    const parsedQuantity = parseDecimal(quantity, locale);
    if (!selected || !parsedQuantity?.gt(0)) {
      setError(t('packaging.lineRequired'));
      return;
    }
    if (appliesTo === 'selected' && channelIds.length === 0) {
      setError(t('packaging.channelRequired'));
      return;
    }
    onAdd({
      id: initialLine?.id ?? `draft-packaging-${Date.now()}`,
      packagingId: selected.id,
      quantityPerPortion: parsedQuantity.toString(),
      appliesTo,
      channelIds: appliesTo === 'all' ? [] : channelIds,
    });
  };

  return (
    <BottomSheet
      visible={visible}
      title={initialLine ? t('packaging.editLineTitle') : t('packaging.addLineTitle')}
      closeLabel={t('recipes.close')}
      onClose={onClose}
      size="half">
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ gap: 14, paddingHorizontal: 16, paddingVertical: 16 }}
        keyboardShouldPersistTaps="handled">
        <View className="min-h-12 flex-row items-center rounded-xl border border-line bg-bg px-3">
          <TextInput
            accessibilityLabel={t('packaging.search')}
            value={query}
            onChangeText={setQuery}
            placeholder={t('packaging.search')}
            placeholderTextColor={Colors.light.tabIconDefault}
            className="min-h-12 flex-1 p-0 font-inter text-base text-ink"
          />
        </View>
        <View className="gap-1">
          {visibleItems.map((item) => {
            const isSelected = selectedId === item.id;
            const costPerPiece = new Decimal(item.packPriceMinor)
              .div(new Decimal(10).pow(fractionDigits))
              .div(item.piecesPerPack);
            return (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
                key={item.id}
                onPress={() => {
                  setSelectedId(item.id);
                  setError('');
                }}
                className={`min-h-14 flex-row items-center justify-between border-b border-line py-2 ${
                  isSelected ? 'bg-brandSoft' : ''
                }`}>
                <View className="flex-1">
                  <Text className="font-inter-semibold text-base text-ink">{item.name}</Text>
                  <Text className="font-inter text-sm text-muted">
                    {t('packaging.costPerPiece', {
                      cost: formatCurrency(costPerPiece, currency, locale),
                    })}
                  </Text>
                </View>
                {isSelected ? (
                  <Text className="ms-2 font-inter-semibold text-sm text-brand">
                    {t('packaging.selected')}
                  </Text>
                ) : null}
              </Pressable>
            );
          })}
        </View>
        {selected ? (
          <>
            <TextField
              label={t('packaging.qtyPerPortionLabel')}
              value={quantity}
              onChangeText={setQuantity}
              onBlur={() => setQuantity(formatDecimalInput(quantity, locale))}
              keyboardType="decimal-pad"
            />
            <View className="gap-2">
              <Text className="font-inter-semibold text-sm text-ink">
                {t('packaging.appliesTo')}
              </Text>
              <ChannelChips
                channels={channels}
                appliesTo={appliesTo}
                channelIds={channelIds}
                onChange={(nextAppliesTo, nextChannelIds) => {
                  setAppliesTo(nextAppliesTo);
                  setChannelIds(nextChannelIds);
                  setError('');
                }}
              />
            </View>
          </>
        ) : null}
        {error ? (
          <Text accessibilityRole="alert" className="font-inter text-sm text-bad">
            {error}
          </Text>
        ) : null}
        <Button
          label={initialLine ? t('packaging.saveLine') : t('packaging.addLine')}
          onPress={handleSave}
          disabled={!selected}
        />
      </ScrollView>
    </BottomSheet>
  );
}
