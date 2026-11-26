import { Text, View } from 'react-native';

export default function IngredientsScreen() {
  return (
    <View className="flex-1 items-center justify-center bg-white dark:bg-black">
      <Text className="text-xl font-bold text-neutral-900 dark:text-neutral-100">Ingredients</Text>
      <Text className="mt-2 text-sm text-neutral-500">Ingredient list coming soon</Text>
    </View>
  );
}
