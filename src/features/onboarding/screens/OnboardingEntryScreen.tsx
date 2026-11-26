import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useTranslation } from 'react-i18next';

import { createDrizzleClient } from '@core/db/client';
import { isOnboardingCompleted } from '../data/onboardingRepository';
import { Colors } from '@shared/theme';

export default function OnboardingEntryScreen() {
  const sqlite = useSQLiteContext();
  const database = useMemo(() => createDrizzleClient(sqlite), [sqlite]);
  const { t } = useTranslation();
  const [loadError, setLoadError] = useState(false);

  const routeToFirstScreen = useCallback(async () => {
    try {
      const completed = await isOnboardingCompleted(database);
      router.replace(completed ? '/(tabs)' : '/onboarding');
    } catch (error) {
      console.error('Unable to check onboarding status.', error);
      setLoadError(true);
    }
  }, [database]);

  useFocusEffect(
    useCallback(() => {
      void routeToFirstScreen();
    }, [routeToFirstScreen]),
  );

  return (
    <SafeAreaView className="flex-1 items-center justify-center bg-background px-6">
      {loadError ? (
        <View className="w-full max-w-md gap-4">
          <Text className="text-center text-base text-ink">
            {t('onboarding.routeError')}
          </Text>
          <Pressable
            accessibilityRole="button"
            className="min-h-12 items-center justify-center rounded-xl bg-brand px-4"
            onPress={() => {
              setLoadError(false);
              void routeToFirstScreen();
            }}>
            <Text className="font-semibold text-white">{t('onboarding.retry')}</Text>
          </Pressable>
        </View>
      ) : (
        <ActivityIndicator
          accessibilityLabel={t('onboarding.loading')}
          color={Colors.light.tint}
        />
      )}
    </SafeAreaView>
  );
}
