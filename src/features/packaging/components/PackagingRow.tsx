import { Decimal } from 'decimal.js';
import { Pressable, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import {
  currencyFractionDigits,
  formatUnitCost,
} from '@core/costing/money';
import type { PackagingItem, RecipePackagingDraft } from '../types';
import type { SalesChannel } from '@features/settings';

export function PackagingRow({
  item,
  packaging,
  channels,
  currency,
  locale,
  onPress,
  onRemove,
}: {
  item: RecipePackagingDraft;
  packaging?: PackagingItem;
  channels: SalesChannel[];
  currency: string;
  locale: string;
  onPress: () => void;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  const fractionDigits = currencyFractionDigits(currency, locale);
  const costPerPiece = packaging
    ? new Decimal(packaging.packPriceMinor)
        .div(new Decimal(10).pow(fractionDigits))
        .div(packaging.piecesPerPack)
    : undefined;
  const channelLabel =
    item.appliesTo === 'all'
      ? t('packaging.allChannels')
      : channels
          .filter((channel) => item.channelIds.includes(channel.id))
          .map((channel) => channel.name)
          .join(', ');

  return (
    <View className="flex-row items-center gap-2 rounded-2xl border border-line bg-surface p-3">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('packaging.editLine', {
          name: packaging?.name ?? t('recipes.missingItemName'),
        })}
        onPress={onPress}
        className="min-h-14 flex-1 justify-center gap-1">
        <Text numberOfLines={1} className="font-inter-semibold text-base text-ink">
          {packaging?.name ?? t('recipes.missingItemName')}
        </Text>
        <Text className="font-inter text-sm text-muted">
          {t('packaging.qtyPerPortion', { quantity: item.quantityPerPortion })}
          {' · '}
          {channelLabel}
        </Text>
        {costPerPiece ? (
          <Text className="font-inter text-sm text-muted">
            {t('packaging.costPerPiece', {
              cost: formatUnitCost(costPerPiece, currency, locale),
            })}
          </Text>
        ) : null}
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('packaging.removeLine')}
        onPress={onRemove}
        className="h-11 w-11 items-center justify-center rounded-full bg-bg">
        <Text className="font-inter-bold text-lg text-bad">×</Text>
      </Pressable>
    </View>
  );
}
