import { Text, View } from 'react-native';

export default function OnboardingScreen() {
  return (
    <View className="flex-1 items-center justify-center bg-white dark:bg-black">
      <Text className="text-xl font-bold text-neutral-900 dark:text-neutral-100">Welcome</Text>
      <Text className="mt-2 text-sm text-neutral-500">First-run flow coming soon</Text>
    </View>
  );
}
