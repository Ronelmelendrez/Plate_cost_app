import { Text, View } from 'react-native';

/** Margins dashboard — placeholder until the real dashboard feature lands. */
export default function DashboardScreen() {
  return (
    <View className="flex-1 items-center justify-center bg-white dark:bg-black">
      <Text className="text-xl font-bold text-neutral-900 dark:text-neutral-100">Margins</Text>
      <Text className="mt-2 text-sm text-neutral-500">Dashboard coming soon</Text>
    </View>
  );
}
