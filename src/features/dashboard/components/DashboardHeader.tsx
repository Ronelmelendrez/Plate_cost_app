import { LinearGradient } from 'expo-linear-gradient';
import { SymbolView } from 'expo-symbols';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, TextInput, View } from 'react-native';

import { Colors, HERO_GRADIENT } from '@shared/theme';

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
    <LinearGradient
      colors={HERO_GRADIENT}
      style={{ paddingHorizontal: 16, paddingBottom: 18, paddingTop: 8 }}>
      <View className="flex-row items-center justify-between gap-3">
        <Text
          accessibilityRole="header"
          className="flex-1 text-[30px] font-inter-extrabold leading-[36px] text-white">
          {t('dashboard.title')}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('analytics.open')}
          onPress={onOpenAnalytics}
          className="min-h-11 flex-row items-center gap-1.5 rounded-full border border-white/30 bg-white/15 px-3.5">
          <SymbolView
            name={{ ios: 'chart.bar.fill', android: 'analytics', web: 'analytics' }}
            tintColor="#FFFFFF"
            size={16}
          />
          <Text className="font-inter-semibold text-[13px] text-white">{t('analytics.title')}</Text>
        </Pressable>
      </View>

      <Text className="mt-1 font-inter text-[13px] leading-[18px] text-white">
        {t('dashboard.subtitle')}
      </Text>

      <View className="mt-3.5 flex-row items-center rounded-2xl bg-surface px-3 shadow-md">
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
          className="min-h-12 flex-1 px-3 py-0 font-inter text-[15px] text-ink"
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
    </LinearGradient>
  );
}
