import { Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';

/** What-if price screen for a recipe. */
export default function PriceWhatIfScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  return (
    <View className="flex-1 items-center justify-center bg-white dark:bg-black">
      <Text className="text-xl font-bold text-neutral-900 dark:text-neutral-100">What-if price</Text>
      <Text className="mt-2 text-sm text-neutral-500">recipe: {id}</Text>
    </View>
  );
}
