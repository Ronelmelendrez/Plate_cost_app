import { SymbolView } from 'expo-symbols';
import { useTranslation } from 'react-i18next';
import { Pressable, TextInput, View } from 'react-native';

import { Colors } from '@shared/theme';

export function DashboardHeader({
  query,
  onChangeQuery,
  onOpenAnalytics,
}: {
  query: string;
  onChangeQuery: (query: string) => void;
  onOpenAnalytics: () => void;
}) {
  const { t } = useTranslation();

  return (
    <View className="border-b border-line bg-surface px-4 py-3">
      <View className="flex-row items-center gap-3">
        <View className="min-h-12 flex-1 flex-row items-center rounded-xl border border-line bg-bg px-3">
          <SymbolView
            name={{ ios: 'magnifyingglass', android: 'search', web: 'search' }}
            tintColor={Colors.light.tabIconDefault}
            size={20}
          />
          <TextInput
            accessibilityLabel={t('dashboard.searchDishes')}
            value={query}
            onChangeText={onChangeQuery}
            placeholder={t('dashboard.searchDishes')}
            placeholderTextColor={Colors.light.tabIconDefault}
            returnKeyType="search"
            className="min-h-12 flex-1 px-3 py-0 text-base text-ink"
          />
          {query ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('dashboard.clearSearch')}
              onPress={() => onChangeQuery('')}
              className="h-12 w-12 items-center justify-center">
              <SymbolView
                name={{ ios: 'xmark.circle.fill', android: 'cancel', web: 'cancel' }}
                tintColor={Colors.light.tabIconDefault}
                size={20}
              />
            </Pressable>
          ) : null}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('analytics.open')}
          onPress={onOpenAnalytics}
          className="h-12 w-12 items-center justify-center rounded-xl border border-line bg-bg">
          <SymbolView
            name={{ ios: 'chart.bar.xaxis', android: 'analytics', web: 'analytics' }}
            tintColor={Colors.light.tint}
            size={22}
          />
        </Pressable>
      </View>
    </View>
  );
}
