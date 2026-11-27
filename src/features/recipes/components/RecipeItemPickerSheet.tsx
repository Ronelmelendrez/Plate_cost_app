import { FlashList } from '@shopify/flash-list';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';

import { detectCycle, type RecipeEdge } from '@core/costing/cycleCheck';
import {
  PURCHASE_UNITS,
  RECIPE_UNITS,
  UNIT_BASE,
  quantityInBaseUnits,
  UnitMismatchError,
  type BaseUnit,
  type ConversionUnit,
  type RecipeUnit,
  type RecipeUnitSizes,
} from '@core/costing/units';
import { formatDecimalInput, parseDecimal } from '@core/costing/money';
import type { Ingredient } from '@features/ingredients/data/ingredientRepository';
import type { Recipe, RecipeItemDraft } from '@features/recipes/data/recipeRepository';
import { BottomSheet, Button, TextField } from '@shared/ui';
import { Colors } from '@shared/theme';

type ItemKind = RecipeItemDraft['kind'];

interface PickerOption {
  id: string;
  kind: ItemKind;
  name: string;
  defaultUnit: RecipeUnit;
  units: RecipeUnit[];
}

interface RecipeItemPickerSheetProps {
  visible: boolean;
  onClose: () => void;
  onAdd: (item: Omit<RecipeItemDraft, 'id'> & { id?: string }) => void;
  ingredients: Ingredient[];
  conversionsByIngredient: Map<
    string,
    { fromUnit: ConversionUnit; baseUnit: BaseUnit }[]
  >;
  recipes: Recipe[];
  recipeEdges: RecipeEdge[];
  currentRecipeId?: string;
  initialItem?: RecipeItemDraft;
  draftItems: RecipeItemDraft[];
  locale: string;
  unitSystem: 'metric' | 'us';
  unitSizes: RecipeUnitSizes;
}

function isRecipeUnitCompatible(
  unit: RecipeUnit,
  baseUnit: 'g' | 'ml' | 'pc',
  unitSizes: RecipeUnitSizes,
) {
  try {
    return quantityInBaseUnits('1', unit, undefined, unitSizes).unit === baseUnit;
  } catch (error) {
    if (error instanceof UnitMismatchError) {
      return false;
    }
    throw error;
  }
}

export function RecipeItemPickerSheet({
  visible,
  onClose,
  onAdd,
  ingredients,
  conversionsByIngredient,
  recipes,
  recipeEdges,
  currentRecipeId,
  initialItem,
  draftItems,
  locale,
  unitSystem,
  unitSizes,
}: RecipeItemPickerSheetProps) {
  const { t } = useTranslation();
  const [kind, setKind] = useState<ItemKind>(initialItem?.kind ?? 'ingredient');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<PickerOption | null>(null);
  const [quantity, setQuantity] = useState(initialItem?.quantity ?? '1');
  const [unit, setUnit] = useState<RecipeUnit>(
    initialItem?.unit ?? (unitSystem === 'us' ? 'lb' : 'kg'),
  );
  const [error, setError] = useState('');

  const options = useMemo<PickerOption[]>(() => {
    if (kind === 'ingredient') {
      return ingredients.map((ingredient) => {
        const baseUnit = UNIT_BASE[ingredient.purchaseUnit];
        const customUnits = (conversionsByIngredient.get(ingredient.id) ?? [])
          .filter((conversion) => conversion.baseUnit === baseUnit)
          .map((conversion) => conversion.fromUnit);
        const units = [
          ...new Set([
            ...PURCHASE_UNITS.filter((candidate) => UNIT_BASE[candidate] === baseUnit),
            ...RECIPE_UNITS.filter((candidate) =>
              isRecipeUnitCompatible(candidate, baseUnit, unitSizes),
            ),
            ...customUnits,
          ]),
        ];
        return {
          id: ingredient.id,
          kind,
          name: ingredient.name,
          defaultUnit: ingredient.purchaseUnit,
          units,
        };
      });
    }

    if (kind === 'recipe') {
      const currentEdges = currentRecipeId
        ? recipeEdges.filter((edge) => edge.recipeId !== currentRecipeId)
        : recipeEdges;
      const draftEdges = currentRecipeId
        ? draftItems
            .filter((item) => item.kind === 'recipe')
            .map((item) => ({ recipeId: currentRecipeId, childRecipeId: item.referenceId }))
        : [];
      const graph = [...currentEdges, ...draftEdges];
      return recipes
        .filter(
          (recipe) =>
            recipe.isSubRecipe &&
            recipe.id !== currentRecipeId &&
            (!currentRecipeId || !detectCycle(currentRecipeId, recipe.id, graph)),
        )
        .map((recipe) => {
          const baseUnit = recipe.batchYieldUnit === 'portion' ? 'pc' : recipe.batchYieldUnit;
          const units = RECIPE_UNITS.filter((candidate) =>
            isRecipeUnitCompatible(candidate, baseUnit, unitSizes),
          );
          return {
            id: recipe.id,
            kind,
            name: recipe.name,
            defaultUnit: recipe.batchYieldUnit === 'portion' ? 'portion' : recipe.batchYieldUnit,
            units,
          };
        });
    }

    return [];
  }, [
    conversionsByIngredient,
    currentRecipeId,
    draftItems,
    ingredients,
    kind,
    recipeEdges,
    recipes,
    unitSizes,
  ]);

  const visibleOptions = options.filter((option) =>
    option.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
  );
  const selectOption = (option: PickerOption) => {
    setSelected(option);
    setUnit(
      initialItem?.referenceId === option.id && initialItem.kind === option.kind
        ? initialItem.unit
        : option.defaultUnit,
    );
    setQuantity(
      initialItem?.referenceId === option.id && initialItem.kind === option.kind
        ? initialItem.quantity
        : '1',
    );
    setError('');
  };

  const handleAdd = () => {
    const parsedQuantity = parseDecimal(quantity, locale);
    if (!selected || !parsedQuantity || parsedQuantity.lte(0) || !selected.units.includes(unit)) {
      setError(t('recipes.itemRequired'));
      return;
    }
    onAdd({
      ...(initialItem?.id ? { id: initialItem.id } : {}),
      kind: selected.kind,
      referenceId: selected.id,
      quantity: parsedQuantity.toString(),
      unit,
    });
  };

  const tabLabels: Record<ItemKind, string> = {
    ingredient: t('recipes.ingredientsTab'),
    recipe: t('recipes.subRecipesTab'),
  };

  return (
    <BottomSheet
      visible={visible}
      title={t('recipes.addItem')}
      closeLabel={t('recipes.close')}
      onClose={onClose}
      size="half">
      <View className="flex-1">
        {selected ? (
          <View className="flex-1">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('recipes.chooseAnotherItem')}
              onPress={() => {
                setSelected(null);
                setError('');
              }}
              className="min-h-12 justify-center px-4">
              <Text className="font-inter-semibold text-base text-brand">
                {t('recipes.chooseAnotherItem')}
              </Text>
            </Pressable>
            <ScrollView
              className="flex-1"
              contentContainerStyle={{ gap: 12, paddingHorizontal: 16, paddingTop: 4 }}
              keyboardShouldPersistTaps="handled">
              <Text className="font-inter-semibold text-base text-ink">{selected.name}</Text>
              <TextField
                label={t('recipes.quantity')}
                value={quantity}
                onChangeText={setQuantity}
                onBlur={() => setQuantity(formatDecimalInput(quantity, locale))}
                keyboardType="decimal-pad"
              />
              <View className="gap-1">
                <Text className="font-inter text-sm text-muted">
                  {t('recipes.selectUnit')}
                </Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ alignItems: 'center', gap: 8 }}>
                  {selected.units.map((availableUnit) => (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityState={{ selected: unit === availableUnit }}
                      accessibilityLabel={t('recipes.selectUnitValue', {
                        unit: t(`units.${availableUnit}`),
                      })}
                      key={availableUnit}
                      onPress={() => setUnit(availableUnit)}
                      className={`min-h-12 min-w-12 items-center justify-center rounded-xl border px-3 ${
                        unit === availableUnit
                          ? 'border-brand bg-brandSoft'
                          : 'border-line bg-surface'
                      }`}>
                      <Text className="font-inter text-sm text-ink">
                        {t(`units.${availableUnit}`)}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
              {error ? (
                <Text accessibilityRole="alert" className="font-inter text-sm text-bad">
                  {error}
                </Text>
              ) : null}
            </ScrollView>
            <View className="border-t border-line px-4 py-3">
              <Button
                label={initialItem ? t('recipes.editItem') : t('recipes.addItem')}
                onPress={handleAdd}
              />
            </View>
          </View>
        ) : (
          <View className="flex-1" style={{ minHeight: 0 }}>
            <View className="flex-row border-b border-line px-2">
              {(['ingredient', 'recipe'] as ItemKind[]).map((tabKind) => (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected: kind === tabKind }}
                  accessibilityLabel={tabLabels[tabKind]}
                  key={tabKind}
                  onPress={() => {
                    setKind(tabKind);
                    setSelected(null);
                    setError('');
                  }}
                  className={`min-h-12 flex-1 items-center justify-center border-b-2 px-2 ${
                    kind === tabKind ? 'border-brand' : 'border-transparent'
                  }`}>
                  <Text className="text-center text-sm font-inter-semibold text-ink">
                    {tabLabels[tabKind]}
                  </Text>
                </Pressable>
              ))}
            </View>
            <View className="mx-4 my-3 min-h-12 flex-row items-center rounded-xl border border-line bg-bg px-3">
              <TextInput
                accessibilityLabel={t('recipes.itemSearch')}
                value={query}
                onChangeText={setQuery}
                placeholder={t('recipes.itemSearch')}
                placeholderTextColor={Colors.light.tabIconDefault}
                className="min-h-12 flex-1 p-0 font-inter text-base text-ink"
              />
            </View>
            <FlashList
              data={visibleOptions}
              keyExtractor={(option) => `${option.kind}-${option.id}`}
              renderItem={({ item }) => (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected: false }}
                  accessibilityLabel={t('recipes.selectItem', { name: item.name })}
                  onPress={() => selectOption(item)}
                  className="min-h-12 flex-row items-center justify-between border-b border-line py-3">
                  <Text className="flex-1 font-inter text-base text-ink">{item.name}</Text>
                  <Text className="ms-2 font-inter text-sm text-muted">
                    {t(`units.${item.defaultUnit}`)}
                  </Text>
                </Pressable>
              )}
              ListEmptyComponent={
                <Text className="py-4 font-inter text-base text-muted">
                  {kind === 'ingredient'
                    ? t('recipes.noIngredients')
                    : t('recipes.noSubRecipes')}
                </Text>
              }
              contentContainerStyle={{ paddingHorizontal: 16 }}
              keyboardShouldPersistTaps="handled"
              style={{ flex: 1, minHeight: 0 }}
            />
          </View>
        )}
      </View>
    </BottomSheet>
  );
}
