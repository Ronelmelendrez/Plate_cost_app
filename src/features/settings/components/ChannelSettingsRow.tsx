import { Pressable, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { formatDecimalInput } from '@core/costing/money';
import type { SalesChannelDraft } from '@features/settings/data/settingsRepository';
import { TextField } from '@shared/ui';

interface ChannelSettingsRowProps {
  channel: SalesChannelDraft;
  locale: string;
  expanded: boolean;
  onToggle: () => void;
  onChange: (patch: Partial<SalesChannelDraft>) => void;
}

export function ChannelSettingsRow({
  channel,
  locale,
  expanded,
  onToggle,
  onChange,
}: ChannelSettingsRowProps) {
  const { t } = useTranslation();

  return (
    <View className="border-b border-line">
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={t('settings.editChannel', { name: channel.name || t('settings.unnamedChannel') })}
        onPress={onToggle}
        className="min-h-16 flex-row items-center justify-between py-3">
        <View className="flex-1 gap-1">
          <Text className="text-base font-semibold text-ink">
            {channel.name || t('settings.unnamedChannel')}
          </Text>
          <Text className="text-sm text-muted">
            {t('settings.channelFeesSummary', {
              commission: channel.commissionPct,
              payment: channel.paymentFeePct,
            })}
          </Text>
        </View>
        <Text className="ms-3 text-base font-semibold text-brand">
          {expanded ? t('settings.closeSection') : t('settings.edit')}
        </Text>
      </Pressable>
      {expanded ? (
        <View className="gap-4 pb-4">
          <TextField
            label={t('settings.channelName')}
            value={channel.name}
            onChangeText={(name) => onChange({ name })}
          />
          <TextField
            label={t('settings.commission')}
            value={channel.commissionPct}
            onChangeText={(commissionPct) => onChange({ commissionPct })}
            onBlur={() =>
              onChange({ commissionPct: formatDecimalInput(channel.commissionPct, locale) })
            }
            keyboardType="decimal-pad"
            suffix="%"
            accessibilityLabel={t('settings.commission')}
          />
          <TextField
            label={t('settings.paymentFee')}
            value={channel.paymentFeePct}
            onChangeText={(paymentFeePct) => onChange({ paymentFeePct })}
            onBlur={() =>
              onChange({ paymentFeePct: formatDecimalInput(channel.paymentFeePct, locale) })
            }
            keyboardType="decimal-pad"
            suffix="%"
            accessibilityLabel={t('settings.paymentFee')}
          />
        </View>
      ) : null}
    </View>
  );
}
