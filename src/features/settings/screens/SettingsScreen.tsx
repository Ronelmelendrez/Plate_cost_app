import { Text, View } from 'react-native';

export default function SettingsScreen() {
  return (
    <View className="flex-1 items-center justify-center bg-white dark:bg-black">
      <Text className="text-xl font-bold text-neutral-900 dark:text-neutral-100">Settings</Text>
      <Text className="mt-2 text-sm text-neutral-500">Currency, locale, tax coming soon</Text>
    </View>
  );
}
