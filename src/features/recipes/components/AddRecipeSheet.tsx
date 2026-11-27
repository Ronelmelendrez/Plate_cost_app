import { SymbolView } from 'expo-symbols';
import type { ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

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
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent>
      <View className="flex-1 justify-end bg-black/30">
        <SafeAreaView edges={['bottom']} className="rounded-t-3xl bg-bg">
          <View className="items-center pb-1 pt-2.5">
            <View className="h-1 w-10 rounded-full bg-line" />
          </View>

          <View className="gap-0.5 px-4 pb-1 pt-2">
            <Text className="font-inter-extrabold text-[20px] leading-[26px] text-ink">
              {t('recipes.newRecipe')}
            </Text>
            <Text className="font-inter text-[13px] leading-[18px] text-muted">
              {t('recipes.addRecipeHint')}
            </Text>
          </View>

          <View className="gap-3 px-4 pt-3">
            {options.map((option) => (
              <Pressable
                key={option.type}
                accessibilityRole="button"
                accessibilityLabel={option.label}
                onPress={() => onSelect(option.type)}
                className="flex-row items-center gap-3 rounded-3xl border border-line bg-surface p-4 shadow-sm">
                <View
                  className={`h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${option.tileClassName}`}>
                  <SymbolView name={option.icon} tintColor={option.iconColor} size={22} />
                </View>
                <View className="min-w-0 flex-1 gap-0.5">
                  <Text className="font-inter-bold text-[16px] leading-[20px] text-ink">
                    {option.label}
                  </Text>
                  <Text className="font-inter text-[13px] leading-[18px] text-muted">
                    {option.hint}
                  </Text>
                </View>
                <SymbolView
                  name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }}
                  tintColor={Colors.light.tabIconDefault}
                  size={18}
                />
              </Pressable>
            ))}
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('recipes.close')}
            onPress={onClose}
            className="mt-2 min-h-14 items-center justify-center">
            <Text className="font-inter-semibold text-[15px] text-muted">
              {t('recipes.close')}
            </Text>
          </Pressable>
        </SafeAreaView>
      </View>
    </Modal>
  );
}
