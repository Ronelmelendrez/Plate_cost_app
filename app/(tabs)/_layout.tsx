import { SymbolView } from 'expo-symbols';
import { Tabs } from 'expo-router';
import type { ComponentProps, ReactNode } from 'react';
import type { ColorValue } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Colors } from '@shared/theme';
import { useColorScheme } from '@shared/lib';

type SymbolName = ComponentProps<typeof SymbolView>['name'];

function tabIcon(name: SymbolName) {
  return function TabIcon({ color }: { color: ColorValue }): ReactNode {
    return <SymbolView name={name} tintColor={color} size={28} />;
  };
}

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const { t } = useTranslation();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors[colorScheme].tint,
        tabBarInactiveTintColor: Colors[colorScheme].tabIconDefault,
        tabBarActiveBackgroundColor: Colors[colorScheme].surface,
        tabBarStyle: {
          backgroundColor: Colors[colorScheme].surface,
          borderTopColor: Colors[colorScheme].line,
        },
        headerShown: false,
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: t('navigation.margins'),
          tabBarIcon: tabIcon({ ios: 'chart.bar.fill', android: 'dashboard', web: 'dashboard' }),
        }}
      />
      <Tabs.Screen
        name="recipes"
        options={{
          title: t('navigation.recipes'),
          tabBarIcon: tabIcon({
            ios: 'list.bullet.rectangle',
            android: 'restaurant_menu',
            web: 'restaurant_menu',
          }),
        }}
      />
      <Tabs.Screen
        name="ingredients"
        options={{
          title: t('ingredients.title'),
          tabBarIcon: tabIcon({
            ios: 'basket.fill',
            android: 'local_grocery_store',
            web: 'local_grocery_store',
          }),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: t('navigation.settings'),
          tabBarIcon: tabIcon({ ios: 'gearshape.fill', android: 'settings', web: 'settings' }),
        }}
      />
    </Tabs>
  );
}
