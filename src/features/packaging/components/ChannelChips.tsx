import { Pressable, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import type { SalesChannel } from '@features/settings';

export function ChannelChips({
  channels,
  appliesTo,
  channelIds,
  onChange,
}: {
  channels: SalesChannel[];
  appliesTo: 'all' | 'selected';
  channelIds: string[];
  onChange: (appliesTo: 'all' | 'selected', channelIds: string[]) => void;
}) {
  const { t } = useTranslation();

  const toggleChannel = (channelId: string) => {
    const updated = channelIds.includes(channelId)
      ? channelIds.filter((id) => id !== channelId)
      : [...channelIds, channelId];
    if (updated.length === 0) {
      onChange('all', []);
    } else {
      onChange('selected', updated);
    }
  };

  return (
    <View className="flex-row flex-wrap gap-2">
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ selected: appliesTo === 'all' }}
        onPress={() => onChange('all', [])}
        className={`min-h-10 justify-center rounded-full border px-3 ${
          appliesTo === 'all' ? 'border-brand bg-brandSoft' : 'border-line bg-surface'
        }`}>
        <Text className="font-inter-semibold text-sm text-ink">
          {t('packaging.allChannels')}
        </Text>
      </Pressable>
      {channels.map((channel) => {
        const selected = appliesTo === 'selected' && channelIds.includes(channel.id);
        return (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityLabel={t('packaging.channelChoice', { channel: channel.name })}
            key={channel.id}
            onPress={() => toggleChannel(channel.id)}
            className={`min-h-10 justify-center rounded-full border px-3 ${
              selected ? 'border-brand bg-brandSoft' : 'border-line bg-surface'
            }`}>
            <Text className="font-inter-semibold text-sm text-ink">{channel.name}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
