import { Decimal } from 'decimal.js';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

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
import {
  currencyAffixes,
  currencyFractionDigits,
  formatCurrency,
  formatDecimalInput,
  parseDecimal,
  toMinorUnits,
} from '@core/costing/money';
import type { Ingredient } from '@features/ingredients/data/ingredientRepository';
import type { PackagingItem, Recipe, RecipeItemDraft } from '@features/recipes/data/recipeRepository';
import { Button, TextField } from '@shared/ui';
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
  onCreatePackaging: (name: string, costMinor: number) => Promise<PackagingItem>;
  ingredients: Ingredient[];
  conversionsByIngredient: Map<
    string,
    { fromUnit: ConversionUnit; baseUnit: BaseUnit }[]
  >;
  recipes: Recipe[];
  packagingItems: PackagingItem[];
  recipeEdges: RecipeEdge[];
  currentRecipeId?: string;
  initialItem?: RecipeItemDraft;
  draftItems: RecipeItemDraft[];
  currency: string;
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
  onCreatePackaging,
  ingredients,
  conversionsByIngredient,
  recipes,
  packagingItems,
  recipeEdges,
  currentRecipeId,
  initialItem,
  draftItems,
  currency,
  locale,
  unitSystem,
  unitSizes,
}: RecipeItemPickerSheetProps) {
  const { t } = useTranslation();
  const fractionDigits = currencyFractionDigits(currency, locale);
  const priceAffixes = currencyAffixes(currency, locale);
  const [kind, setKind] = useState<ItemKind>(initialItem?.kind ?? 'ingredient');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<PickerOption | null>(null);
  const [quantity, setQuantity] = useState(initialItem?.quantity ?? '1');
  const [unit, setUnit] = useState<RecipeUnit>(
    initialItem?.unit ?? (unitSystem === 'us' ? 'lb' : 'kg'),
  );
  const [error, setError] = useState('');
  const [isCreatingPackaging, setIsCreatingPackaging] = useState(false);
  const [packagingName, setPackagingName] = useState('');
  const [packagingPrice, setPackagingPrice] = useState('');
  const [isSavingPackaging, setIsSavingPackaging] = useState(false);

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

    return packagingItems.map((item) => ({
      id: item.id,
      kind,
      name: item.name,
      defaultUnit: 'piece',
      units: ['piece'],
    }));
  }, [
    conversionsByIngredient,
    currentRecipeId,
    draftItems,
    ingredients,
    kind,
    packagingItems,
    recipeEdges,
    recipes,
    unitSizes,
  ]);

  const visibleOptions = options.filter((option) =>
    option.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
  );
  const selectedPrice = kind === 'packaging' && selected
    ? packagingItems.find((item) => item.id === selected.id)?.costMinor
    : undefined;

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
      id:
        initialItem?.id ??
        `draft-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      kind: selected.kind,
      referenceId: selected.id,
      quantity: parsedQuantity.toString(),
      unit,
    });
  };

  const handleCreatePackaging = async () => {
    const parsedPrice = parseDecimal(packagingPrice, locale);
    if (!packagingName.trim()) {
      setError(t('recipes.packagingNameRequired'));
      return;
    }
    if (!parsedPrice || parsedPrice.lte(0)) {
      setError(t('recipes.packagingCostRequired'));
      return;
    }
    const costMinor = toMinorUnits(parsedPrice, fractionDigits);
    if (costMinor === null) {
      setError(t('recipes.pricePrecision', { digits: fractionDigits, currency }));
      return;
    }

    setIsSavingPackaging(true);
    setError('');
    try {
      const created = await onCreatePackaging(packagingName.trim(), costMinor);
      setIsCreatingPackaging(false);
      setPackagingName('');
      setPackagingPrice('');
      setSelected({
        id: created.id,
        kind: 'packaging',
        name: packagingName.trim(),
        defaultUnit: 'piece',
        units: ['piece'],
      });
      setKind('packaging');
      setQuantity('1');
      setUnit('piece');
    } catch (saveError) {
      console.error('Unable to create packaging item.', saveError);
      setError(t('recipes.packagingError'));
    } finally {
      setIsSavingPackaging(false);
    }
  };

  const tabLabels: Record<ItemKind, string> = {
    ingredient: t('recipes.ingredientsTab'),
    recipe: t('recipes.subRecipesTab'),
    packaging: t('recipes.packagingTab'),
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent>
      <View className="flex-1 justify-end bg-black/30">
        <SafeAreaView edges={['bottom']} className="max-h-[90%] rounded-t-2xl bg-bg">
          <View className="flex-row items-center justify-between border-b border-line px-4 py-3">
            <Text className="text-xl font-semibold text-ink">
              {isCreatingPackaging ? t('recipes.createPackaging') : t('recipes.addItem')}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('recipes.close')}
              onPress={onClose}
              className="min-h-12 min-w-12 items-center justify-center">
              <Text className="text-base text-ink">{t('recipes.close')}</Text>
            </Pressable>
          </View>

          {isCreatingPackaging ? (
            <ScrollView
              contentContainerClassName="gap-4 px-4 py-4"
              keyboardShouldPersistTaps="handled">
              <TextField
                label={t('recipes.packagingName')}
                value={packagingName}
                onChangeText={setPackagingName}
              />
              <TextField
                label={t('recipes.packagingCost')}
                value={packagingPrice}
                onChangeText={setPackagingPrice}
                onBlur={() => setPackagingPrice(formatDecimalInput(packagingPrice, locale))}
                keyboardType="decimal-pad"
                prefix={priceAffixes.prefix}
                suffix={priceAffixes.suffix}
              />
              {error ? (
                <Text accessibilityRole="alert" className="text-sm text-bad">
                  {error}
                </Text>
              ) : null}
              <Button
                label={t('recipes.savePackaging')}
                onPress={() => void handleCreatePackaging()}
                disabled={isSavingPackaging}
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('recipes.close')}
                onPress={() => setIsCreatingPackaging(false)}
                className="min-h-12 items-center justify-center">
                <Text className="text-base text-muted">{t('recipes.close')}</Text>
              </Pressable>
            </ScrollView>
          ) : (
            <View className="flex-shrink">
              <View className="flex-row border-b border-line px-2">
                {(['ingredient', 'recipe', 'packaging'] as ItemKind[]).map((tabKind) => (
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
                    <Text className="text-center text-sm font-semibold text-ink">
                      {tabLabels[tabKind]}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <View className="mx-4 my-3 min-h-12 flex-row items-center rounded-xl border border-line bg-surface px-3">
                <TextInput
                  accessibilityLabel={t('recipes.itemSearch')}
                  value={query}
                  onChangeText={setQuery}
                  placeholder={t('recipes.itemSearch')}
                  placeholderTextColor={Colors.light.tabIconDefault}
                  className="min-h-12 flex-1 p-0 text-base text-ink"
                />
              </View>
              <ScrollView className="max-h-56 px-4" keyboardShouldPersistTaps="handled">
                {visibleOptions.length === 0 ? (
                  <Text className="py-4 text-base text-muted">
                    {kind === 'ingredient'
                      ? t('recipes.noIngredients')
                      : kind === 'recipe'
                        ? t('recipes.noSubRecipes')
                        : t('recipes.noPackaging')}
                  </Text>
                ) : (
                  visibleOptions.map((option) => (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityState={{
                        selected: selected?.id === option.id && selected.kind === option.kind,
                      }}
                      accessibilityLabel={t('recipes.selectItem', { name: option.name })}
                      key={option.id}
                      onPress={() => selectOption(option)}
                      className={`min-h-12 flex-row items-center justify-between border-b border-line py-3 ${
                        selected?.id === option.id && selected.kind === option.kind
                          ? 'bg-surface'
                          : ''
                      }`}>
                      <Text className="flex-1 text-base text-ink">{option.name}</Text>
                      <Text className="ms-2 text-sm text-muted">
                        {t(`units.${option.defaultUnit}`)}
                      </Text>
                    </Pressable>
                  ))
                )}
              </ScrollView>
              {kind === 'packaging' ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('recipes.createPackaging')}
                  onPress={() => {
                    setIsCreatingPackaging(true);
                    setError('');
                  }}
                  className="mx-4 mt-2 min-h-12 items-center justify-center rounded-xl border border-line bg-surface">
                  <Text className="text-base font-semibold text-ink">
                    {t('recipes.createPackaging')}
                  </Text>
                </Pressable>
              ) : null}
              {selected ? (
                <View className="gap-3 px-4 pb-4 pt-3">
                  <Text className="text-sm font-semibold text-ink">{selected.name}</Text>
                  {selectedPrice !== undefined ? (
                    <Text className="text-sm text-muted">
                      {formatCurrency(
                        new Decimal(selectedPrice).div(new Decimal(10).pow(fractionDigits)),
                        currency,
                        locale,
                      )}
                    </Text>
                  ) : null}
                  <View className="flex-row items-end gap-3">
                    <View className="flex-1">
                      <TextField
                        label={t('recipes.quantity')}
                        value={quantity}
                        onChangeText={setQuantity}
                        onBlur={() => setQuantity(formatDecimalInput(quantity, locale))}
                        keyboardType="decimal-pad"
                      />
                    </View>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerClassName="items-center gap-2">
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
                              ? 'border-ink bg-surface'
                              : 'border-line bg-surface'
                          }`}>
                          <Text className="text-sm text-ink">
                            {t(`units.${availableUnit}`)}
                          </Text>
                        </Pressable>
                      ))}
                    </ScrollView>
                  </View>
                  {error ? (
                    <Text accessibilityRole="alert" className="text-sm text-bad">
                      {error}
                    </Text>
                  ) : null}
                  <Button
                    label={initialItem ? t('recipes.editItem') : t('recipes.addItem')}
                    onPress={handleAdd}
                  />
                </View>
              ) : null}
            </View>
          )}
        </SafeAreaView>
      </View>
    </Modal>
  );
}
