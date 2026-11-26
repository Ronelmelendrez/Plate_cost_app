import { Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';

export default function IngredientDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  return (
    <View className="flex-1 items-center justify-center bg-white dark:bg-black">
      <Text className="text-xl font-bold text-neutral-900 dark:text-neutral-100">Ingredient</Text>
      <Text className="mt-2 text-sm text-neutral-500">id: {id}</Text>
    </View>
  );
}
