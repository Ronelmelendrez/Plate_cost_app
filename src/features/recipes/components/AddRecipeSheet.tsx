import { SymbolView } from 'expo-symbols';
import type { ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';

import { BottomSheet } from '@shared/ui';
import { Colors } from '@shared/theme';

type RecipeType = 'dish' | 'sub-recipe';
type SymbolName = ComponentProps<typeof SymbolView>['name'];

interface AddRecipeSheetProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (type: RecipeType) => void;
}

export function AddRecipeSheet({ visible, onClose, onSelect }: AddRecipeSheetProps) {
  const { t } = useTranslation();

  const options: {
    type: RecipeType;
    label: string;
    hint: string;
    icon: SymbolName;
    tileClassName: string;
    iconColor: string;
  }[] = [
    {
      type: 'dish',
      label: t('recipes.addRecipe'),
      hint: t('recipes.addDishHint'),
      icon: { ios: 'fork.knife', android: 'restaurant_menu', web: 'restaurant_menu' },
      tileClassName: 'bg-brandSoft',
      iconColor: Colors.light.tint,
    },
    {
      type: 'sub-recipe',
      label: t('recipes.addSubRecipe'),
      hint: t('recipes.addSubRecipeHint'),
      icon: { ios: 'square.stack.3d.up', android: 'layers', web: 'layers' },
      tileClassName: 'bg-warnSoft',
      iconColor: Colors.light.warn,
    },
  ];

  return (
    <BottomSheet
      visible={visible}
      title={t('recipes.newRecipe')}
      subtitle={t('recipes.addRecipeHint')}
      closeLabel={t('recipes.close')}
      onClose={onClose}>
      <View className="gap-3 px-4 py-4">
        {options.map((option) => (
          <Pressable
            key={option.type}
            accessibilityRole="button"
            accessibilityLabel={option.label}
            onPress={() => onSelect(option.type)}
            className="min-h-20 flex-row items-center gap-3 rounded-2xl border border-line bg-surface p-4">
            <View
              className={`h-12 w-12 shrink-0 items-center justify-center rounded-xl ${option.tileClassName}`}>
              <SymbolView name={option.icon} tintColor={option.iconColor} size={22} />
            </View>
            <View className="min-w-0 flex-1 gap-0.5">
              <Text className="font-inter-semibold text-base text-ink">{option.label}</Text>
              <Text className="font-inter text-sm leading-5 text-muted">{option.hint}</Text>
            </View>
            <SymbolView
              name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }}
              tintColor={Colors.light.tabIconDefault}
              size={18}
            />
          </Pressable>
        ))}
      </View>
    </BottomSheet>
  );
}
