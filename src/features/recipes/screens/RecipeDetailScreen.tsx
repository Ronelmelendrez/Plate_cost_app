import { Decimal } from 'decimal.js';
import { getLocales } from 'expo-localization';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  calculateRecipeCost,
  InvalidSubRecipeError,
  MissingRecipeReferenceError,
  RecipeCycleError,
  type RecipeCostInput,
  type RecipeCostLine,
} from '@core/costing/costEngine';
import {
  currencyAffixes,
  currencyFractionDigits,
  formatDecimalInput,
  parseDecimal,
  toMinorUnits,
} from '@core/costing/money';
import {
  type BaseUnit,
  type ConversionUnit,
  RECIPE_YIELD_UNITS,
  type RecipeYieldUnit,
} from '@core/costing/units';
import { calculateChannelPricing } from '@core/costing/channelPricing';
import type { RecipeEdge } from '@core/costing/cycleCheck';
import { createDrizzleClient } from '@core/db/client';
import type { Ingredient } from '@features/ingredients/data/ingredientRepository';
import {
  getRecipeEditorData,
  getRecipeWorkspace,
  savePackagingItem,
  saveRecipe,
  type PackagingItem,
  type Recipe,
  type RecipeItemDraft,
} from '@features/recipes/data/recipeRepository';
import { RecipeCostSummary } from '@features/recipes/components/RecipeCostSummary';
import { RecipeItemPickerSheet } from '@features/recipes/components/RecipeItemPickerSheet';
import { RecipeItemRow } from '@features/recipes/components/RecipeItemRow';
import { getAppSettings, type AppSettings, type SalesChannel } from '@features/settings';
import { Button, TextField } from '@shared/ui';
import { Colors } from '@shared/theme';

const localeInfo = getLocales()[0];
const deviceLocale = localeInfo?.languageTag ?? 'en-US';
const deviceCurrency = localeInfo?.currencyCode ?? 'USD';

interface RecipeWorkspace {
  ingredients: Ingredient[];
  conversionsByIngredient: Map<
    string,
    { fromUnit: ConversionUnit; baseQuantity: string; baseUnit: BaseUnit }[]
  >;
  recipes: Recipe[];
  packagingItems: PackagingItem[];
  wastePct: string;
  settings: AppSettings;
  channels: SalesChannel[];
  channelPrices: { recipeId: string; channelId: string; priceMinor: number }[];
  unitSizes: { cupMl: string; tablespoonMl: string };
  recipeEdges: RecipeEdge[];
  recipeCostInputs: RecipeCostInput[];
}

interface FormErrors {
  name?: string;
  portions?: string;
  batchYield?: string;
  laborMinutes?: string;
  laborRate?: string;
  overhead?: string;
  items?: string;
  channelPrices?: string;
}

function isUnitMismatch(error: unknown) {
  return error instanceof Error && error.name === 'UnitMismatchError';
}

export default function RecipeDetailScreen() {
  const { id, type } = useLocalSearchParams<{ id: string; type?: string }>();
  const isNew = id === 'new';
  const initialSubRecipe = isNew && type === 'sub-recipe';
  const sqlite = useSQLiteContext();
  const database = useMemo(() => createDrizzleClient(sqlite), [sqlite]);
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  const [workspace, setWorkspace] = useState<RecipeWorkspace | null>(null);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [name, setName] = useState('');
  const [isSubRecipe, setIsSubRecipe] = useState(initialSubRecipe);
  const [portions, setPortions] = useState('1');
  const [batchYieldQuantity, setBatchYieldQuantity] = useState('1');
  const [batchYieldUnit, setBatchYieldUnit] = useState<RecipeYieldUnit>('portion');
  const [channelPriceValues, setChannelPriceValues] = useState<Record<string, string>>({});
  const [selectedChannelIds, setSelectedChannelIds] = useState<string[]>([]);
  const [expandedChannelPriceId, setExpandedChannelPriceId] = useState<string>();
  const [items, setItems] = useState<RecipeItemDraft[]>([]);
  const [notes, setNotes] = useState('');
  const [laborMinutes, setLaborMinutes] = useState('0');
  const [laborRate, setLaborRate] = useState('0');
  const [overheadMode, setOverheadMode] = useState<'none' | 'flat' | 'percent'>('none');
  const [overheadValue, setOverheadValue] = useState('0');
  const [isMoreOptionsOpen, setIsMoreOptionsOpen] = useState(false);
  const [isItemPickerOpen, setIsItemPickerOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<RecipeItemDraft>();
  const [formErrors, setFormErrors] = useState<FormErrors>({});
  const [formError, setFormError] = useState('');
  const [isLoadError, setIsLoadError] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [removedItem, setRemovedItem] = useState<RecipeItemDraft>();
  const locale = settings?.locale ?? deviceLocale;
  const currency = settings?.currencyCode ?? deviceCurrency;
  const fractionDigits = currencyFractionDigits(currency, locale);
  const priceAffixes = currencyAffixes(currency, locale);

  const loadData = useCallback(async () => {
    setFormError('');
    setIsLoadError(false);
    try {
      const currentSettings = await getAppSettings(database);
      setSettings(currentSettings);
      const currentFractionDigits = currencyFractionDigits(
        currentSettings.currencyCode,
        currentSettings.locale,
      );
      if (isNew) {
        const data = await getRecipeWorkspace(database);
        setWorkspace(data);
        const initialChannel = data.channels.find((channel) => channel.id === 'dine-in') ??
          data.channels[0];
        setSelectedChannelIds(initialChannel ? [initialChannel.id] : []);
        setChannelPriceValues({});
        setExpandedChannelPriceId(initialChannel?.id);
      } else {
        const data = await getRecipeEditorData(database, id, currentFractionDigits);
        if (!data) {
          setFormError(t('recipes.recipeLoadError'));
          setIsLoadError(true);
          return;
        }
        setWorkspace(data);
        const storedPrices =
          data.channelPrices.length > 0
            ? data.channelPrices
            : data.recipe.sellingPriceMinor === null
              ? []
              : [{ channelId: 'dine-in', priceMinor: data.recipe.sellingPriceMinor }];
        setSelectedChannelIds(storedPrices.map((price) => price.channelId));
        setChannelPriceValues(
          Object.fromEntries(
            storedPrices.map((price) => [
              price.channelId,
              new Decimal(price.priceMinor)
                .div(new Decimal(10).pow(currentFractionDigits))
                .toFixed(currentFractionDigits),
            ]),
          ),
        );
        setExpandedChannelPriceId(storedPrices[0]?.channelId);
        setName(data.recipe.name);
        setIsSubRecipe(data.recipe.isSubRecipe);
        setPortions(String(data.recipe.portions));
        setBatchYieldQuantity(data.recipe.batchYieldQuantity);
        setBatchYieldUnit(data.recipe.batchYieldUnit);
        setItems(data.items);
        setNotes(data.recipe.notes ?? '');
        setLaborMinutes(data.recipe.laborMinutes);
        setLaborRate(
          new Decimal(data.recipe.laborRateMinor)
            .div(new Decimal(10).pow(currentFractionDigits))
            .toFixed(currentFractionDigits),
        );
        setOverheadMode(data.recipe.overheadMode);
        setOverheadValue(data.recipe.overheadValue);
      }
      setIsReady(true);
    } catch (loadError) {
      console.error('Unable to load recipe builder data.', loadError);
      setFormError(t('recipes.loadError'));
      setIsLoadError(true);
    }
  }, [database, id, isNew, t]);

  useFocusEffect(
    useCallback(() => {
      void loadData();
    }, [loadData]),
  );

  const costPreview = useMemo(() => {
    if (!workspace || items.length === 0) {
      return { result: undefined, error: undefined };
    }
    try {
      const recipeInputs = new Map(
        workspace.recipeCostInputs.map((recipe) => [recipe.id, recipe]),
      );
      const costLines: RecipeCostLine[] = items.map((item) => {
        const base = {
          id: item.id,
          kind: item.kind,
          name: '',
          quantity: item.quantity,
          unit: item.unit,
        };
        if (item.kind === 'ingredient') {
          const ingredient = workspace.ingredients.find((candidate) => candidate.id === item.referenceId);
          if (!ingredient) {
            return { ...base, kind: 'ingredient', name: '', ingredient: undefined };
          }
          return {
            ...base,
            kind: 'ingredient',
            name: ingredient.name,
            ingredient: {
              id: ingredient.id,
              name: ingredient.name,
              purchaseUnit: ingredient.purchaseUnit,
              purchaseQuantity: ingredient.purchaseQuantity,
              purchasePriceMinor: ingredient.purchasePriceMinor,
              usableYieldPct: ingredient.usableYieldPct,
              conversions: workspace.conversionsByIngredient.get(ingredient.id) ?? [],
            },
          };
        }
        if (item.kind === 'recipe') {
          const child = recipeInputs.get(item.referenceId);
          return {
            ...base,
            kind: 'recipe',
            name: workspace.recipes.find((candidate) => candidate.id === item.referenceId)?.name ?? '',
            detail: child,
          };
        }
        return {
          ...base,
          kind: 'packaging',
          name: workspace.packagingItems.find((candidate) => candidate.id === item.referenceId)?.name ?? '',
          packaging: workspace.packagingItems.find((candidate) => candidate.id === item.referenceId),
        };
      });

      const recipe: RecipeCostInput = {
        id: isNew ? 'draft-recipe' : id,
        isSubRecipe,
        portions: Number(portions),
        batchYieldQuantity,
        batchYieldUnit,
        laborMinutes,
        laborRateMinor: toMinorUnits(parseDecimal(laborRate, locale) ?? new Decimal(0), fractionDigits) ?? 0,
        overheadMode,
        overheadValue,
        items: costLines,
      };
      return {
        result: calculateRecipeCost(
          recipe,
          workspace.wastePct,
          fractionDigits,
          workspace.unitSizes,
        ),
        error: undefined,
      };
    } catch (costError) {
      if (isUnitMismatch(costError)) {
        return { result: undefined, error: t('recipes.unitMismatch') };
      }
      if (costError instanceof RecipeCycleError) {
        return { result: undefined, error: t('recipes.cycleError') };
      }
      if (costError instanceof InvalidSubRecipeError) {
        return { result: undefined, error: t('recipes.invalidSubRecipe') };
      }
      if (costError instanceof MissingRecipeReferenceError) {
        return { result: undefined, error: t('recipes.missingItem') };
      }
      console.error('Unable to calculate recipe cost.', costError);
      return { result: undefined, error: t('recipes.costError') };
    }
  }, [
    batchYieldQuantity,
    batchYieldUnit,
    fractionDigits,
    id,
    isNew,
    isSubRecipe,
    items,
    locale,
    laborMinutes,
    laborRate,
    overheadMode,
    overheadValue,
    portions,
    t,
    workspace,
  ]);

  const previewChannel = selectedChannelIds
    .map((channelId) => ({
      channel: workspace?.channels.find((channel) => channel.id === channelId),
      price: parseDecimal(channelPriceValues[channelId] ?? '', locale),
    }))
    .find((entry) => entry.channel && entry.price?.gt(0));
  const previewPriceMinor = previewChannel?.price
    ? toMinorUnits(previewChannel.price, fractionDigits)
    : null;
  const profitPerPortion =
    !isSubRecipe &&
    costPreview.result &&
    previewChannel?.channel &&
    previewPriceMinor !== null &&
    settings
      ? calculateChannelPricing({
          costPerPortion: costPreview.result.costPerPortion,
          priceMinor: previewPriceMinor,
          fractionDigits,
          commissionPct: previewChannel.channel.commissionPct,
          paymentFeePct: previewChannel.channel.paymentFeePct,
          pricesIncludeTax: settings.pricesIncludeTax,
          taxPct: settings.taxPct,
          feesOnTaxIncludedPrice: settings.feesOnTaxIncludedPrice,
        }).profit
      : undefined;

  const openItemPicker = (item?: RecipeItemDraft) => {
    setEditingItem(item);
    setIsItemPickerOpen(true);
  };

  const addItemToDraft = (draft: Omit<RecipeItemDraft, 'id'> & { id?: string }) => {
    const updated = draft.id
      ? items.map((item) => (item.id === draft.id ? { ...item, ...draft } : item))
      : [...items, { ...draft, id: `draft-${Date.now()}-${items.length}` }];
    setItems(updated);
    setFormErrors((current) => ({ ...current, items: undefined }));
    setIsItemPickerOpen(false);
    setEditingItem(undefined);
  };

  const toggleChannel = (channelId: string) => {
    const isSelected = selectedChannelIds.includes(channelId);
    setSelectedChannelIds((current) =>
      isSelected ? current.filter((id) => id !== channelId) : [...current, channelId],
    );
    setExpandedChannelPriceId((current) =>
      isSelected ? (current === channelId ? undefined : current) : channelId,
    );
    setFormErrors((current) => ({ ...current, channelPrices: undefined }));
  };

  const validateAndSave = async () => {
    const errors: FormErrors = {};
    const parsedName = name.trim();
    const parsedPortions = parseDecimal(portions, locale);
    const parsedYield = parseDecimal(batchYieldQuantity, locale);
    const parsedLaborMinutes = parseDecimal(laborMinutes, locale);
    const parsedLaborRate = parseDecimal(laborRate, locale);
    const parsedOverhead = parseDecimal(overheadValue, locale);
    const channelPriceDrafts: { channelId: string; priceMinor: number }[] = [];

    if (!parsedName) {
      errors.name = t('recipes.nameRequired');
    }
    if (
      !isSubRecipe &&
      (!parsedPortions ||
        !parsedPortions.isInteger() ||
        parsedPortions.lt(1) ||
        !Number.isSafeInteger(parsedPortions.toNumber()))
    ) {
      errors.portions = t('recipes.portionsRequired');
    }
    if (isSubRecipe && (!parsedYield || parsedYield.lte(0))) {
      errors.batchYield = t('recipes.yieldRequired');
    }
    if (!isSubRecipe && selectedChannelIds.length === 0) {
      errors.channelPrices = t('recipes.channelRequired');
    }
    if (!isSubRecipe) {
      for (const channelId of selectedChannelIds) {
        const price = parseDecimal(channelPriceValues[channelId] ?? '', locale);
        const priceMinor = price?.gt(0) ? toMinorUnits(price, fractionDigits) : null;
        if (priceMinor === null) {
          errors.channelPrices = price?.gt(0)
            ? t('recipes.pricePrecision', { digits: fractionDigits, currency })
            : t('recipes.channelPriceRequired');
          break;
        }
        channelPriceDrafts.push({ channelId, priceMinor });
      }
    }
    if (!parsedLaborMinutes || parsedLaborMinutes.lt(0)) {
      errors.laborMinutes = t('recipes.advancedNumberError');
    }
    if (!parsedLaborRate || parsedLaborRate.lt(0) || toMinorUnits(parsedLaborRate, fractionDigits) === null) {
      errors.laborRate = t('recipes.advancedNumberError');
    }
    if (!parsedOverhead || parsedOverhead.lt(0) || (overheadMode === 'percent' && parsedOverhead.gt(100))) {
      errors.overhead = t('recipes.advancedNumberError');
    }
    if (items.some((item) => !parseDecimal(item.quantity, locale)?.gt(0))) {
      errors.items = t('recipes.itemRequired');
    }

    setFormErrors(errors);
    if (Object.keys(errors).length > 0) {
      return;
    }

    setIsSaving(true);
    setFormError('');
    setIsLoadError(false);
    try {
      await saveRecipe(database, {
        id: isNew ? undefined : id,
        name: parsedName,
        portions: isSubRecipe ? 1 : parsedPortions?.toNumber() ?? 1,
        batchYieldQuantity: isSubRecipe ? parsedYield?.toString() ?? '1' : portions,
        batchYieldUnit: isSubRecipe ? batchYieldUnit : 'portion',
        isSubRecipe,
        sellingPriceMinor:
          channelPriceDrafts.find((price) => price.channelId === 'dine-in')?.priceMinor ??
          channelPriceDrafts[0]?.priceMinor ??
          null,
        notes: notes.trim(),
        laborMinutes: parsedLaborMinutes?.toString() ?? '0',
        laborRateMinor: toMinorUnits(parsedLaborRate ?? new Decimal(0), fractionDigits) ?? 0,
        overheadMode,
        overheadValue: parsedOverhead?.toString() ?? '0',
        channelPrices: channelPriceDrafts,
        items: items.map((item) => ({
          ...item,
          quantity: parseDecimal(item.quantity, locale)?.toString() ?? item.quantity,
        })),
      });
      router.back();
    } catch (saveError) {
      console.error('Unable to save recipe.', saveError);
      if (saveError instanceof RecipeCycleError) {
        setFormError(t('recipes.cycleError'));
      } else if (saveError instanceof MissingRecipeReferenceError) {
        setFormError(t('recipes.missingItem'));
      } else if (saveError instanceof InvalidSubRecipeError) {
        setFormError(t('recipes.invalidSubRecipe'));
      } else {
        setFormError(t('recipes.saveError'));
      }
    } finally {
      setIsSaving(false);
    }
  };

  const resolveItemName = (item: RecipeItemDraft) => {
    if (!workspace) {
      return '';
    }
    if (item.kind === 'ingredient') {
      return workspace.ingredients.find((candidate) => candidate.id === item.referenceId)?.name ?? t('recipes.missingItemName');
    }
    if (item.kind === 'recipe') {
      return workspace.recipes.find((candidate) => candidate.id === item.referenceId)?.name ?? t('recipes.missingItemName');
    }
    return workspace.packagingItems.find((candidate) => candidate.id === item.referenceId)?.name ?? t('recipes.missingItemName');
  };

  const handleCreatePackaging = async (itemName: string, costMinor: number) => {
    const created = await savePackagingItem(database, itemName, costMinor);
    setWorkspace((current) =>
      current
        ? {
            ...current,
            packagingItems: [
              ...current.packagingItems,
              { id: created.id, name: itemName, costMinor, updatedAt: new Date().toISOString() },
            ],
          }
        : current,
    );
    return { ...created, name: itemName, costMinor, updatedAt: new Date().toISOString() };
  };

  const removeDraftItem = (item: RecipeItemDraft) => {
    setItems((current) => current.filter((entry) => entry.id !== item.id));
    setRemovedItem(item);
  };

  const undoRemoveDraftItem = () => {
    if (!removedItem) {
      return;
    }
    setItems((current) =>
      current.some((item) => item.id === removedItem.id)
        ? current
        : [...current, removedItem],
    );
    setRemovedItem(undefined);
  };

  const selectedRecipeEdges = useMemo<RecipeEdge[]>(
    () => [
      ...(workspace?.recipeEdges.filter((edge) => edge.recipeId !== id) ?? []),
      ...items
        .filter((item) => item.kind === 'recipe')
        .map((item) => ({ recipeId: isNew ? 'draft-recipe' : id, childRecipeId: item.referenceId })),
    ],
    [id, isNew, items, workspace],
  );

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-bg">
      <View className="flex-row items-center px-4 pb-3 pt-1">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('recipes.close')}
          onPress={() => router.back()}
          className="me-3 min-h-12 min-w-12 items-center justify-center">
          <SymbolView
            name={{ ios: 'chevron.left', android: 'arrow_back', web: 'arrow_back' }}
            tintColor={Colors.light.text}
            size={24}
          />
        </Pressable>
        <Text className="flex-1 text-xl font-semibold text-ink">
          {isNew ? t('recipes.newRecipe') : t('recipes.editRecipe')}
        </Text>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerClassName="gap-5 px-4 pb-6"
        keyboardShouldPersistTaps="handled">
        {formError && isLoadError ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('recipes.retry')}
            onPress={() => void loadData()}
            className="min-h-12 justify-center">
            <Text accessibilityRole="alert" className="text-base text-bad">
              {formError} {t('recipes.retry')}
            </Text>
          </Pressable>
        ) : formError ? (
          <Text accessibilityRole="alert" className="text-base text-bad">
            {formError}
          </Text>
        ) : null}
        <View className="flex-row gap-2">
          {(['dish', 'sub-recipe'] as const).map((recipeType) => {
            const selected = isSubRecipe === (recipeType === 'sub-recipe');
            return (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityLabel={t(
                  recipeType === 'dish' ? 'recipes.dishType' : 'recipes.subRecipeType',
                )}
                onPress={() => {
                  const nextIsSubRecipe = recipeType === 'sub-recipe';
                  setIsSubRecipe(nextIsSubRecipe);
                  if (nextIsSubRecipe) {
                    setBatchYieldQuantity(portions);
                    setBatchYieldUnit('portion');
                  }
                }}
                key={recipeType}
                className={`min-h-12 flex-1 items-center justify-center rounded-xl border px-3 ${
                  selected ? 'border-ink bg-surface' : 'border-line bg-surface'
                }`}>
                <Text className="text-base font-semibold text-ink">
                  {t(recipeType === 'dish' ? 'recipes.dishType' : 'recipes.subRecipeType')}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <TextField
          label={t('recipes.name')}
          value={name}
          onChangeText={(value) => {
            setName(value);
            setFormErrors((current) => ({ ...current, name: undefined }));
          }}
          error={formErrors.name}
        />
        {isSubRecipe ? (
          <>
            <TextField
              label={t('recipes.batchYield')}
              value={batchYieldQuantity}
              onChangeText={(value) => {
                setBatchYieldQuantity(value);
                setFormErrors((current) => ({ ...current, batchYield: undefined }));
              }}
              onBlur={() => setBatchYieldQuantity(formatDecimalInput(batchYieldQuantity, locale))}
              keyboardType="decimal-pad"
              suffix={t(`units.${batchYieldUnit}`)}
              error={formErrors.batchYield}
            />
            <View className="gap-2">
              <Text className="text-sm font-semibold text-ink">{t('recipes.yieldUnit')}</Text>
              <View className="flex-row gap-2">
                {RECIPE_YIELD_UNITS.map((yieldUnit) => (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ selected: batchYieldUnit === yieldUnit }}
                    accessibilityLabel={t('recipes.selectYieldUnit', {
                      unit: t(`units.${yieldUnit}`),
                    })}
                    onPress={() => setBatchYieldUnit(yieldUnit)}
                    key={yieldUnit}
                    className={`min-h-12 min-w-12 items-center justify-center rounded-xl border px-3 ${
                      batchYieldUnit === yieldUnit
                        ? 'border-ink bg-surface'
                        : 'border-line bg-surface'
                    }`}>
                    <Text className="text-base text-ink">{t(`units.${yieldUnit}`)}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          </>
        ) : (
          <>
            <TextField
              label={t('recipes.portions')}
              value={portions}
              onChangeText={(value) => {
                setPortions(value);
                setFormErrors((current) => ({ ...current, portions: undefined }));
              }}
              onBlur={() => setPortions(formatDecimalInput(portions, locale))}
              keyboardType="decimal-pad"
              error={formErrors.portions}
            />
          </>
        )}

        {!isSubRecipe ? (
          <View className="gap-2">
            <Text className="text-base font-semibold text-ink">
              {t('recipes.salesChannels')}
            </Text>
            {workspace?.channels.map((channel) => {
              const isSelected = selectedChannelIds.includes(channel.id);
              const isPriceExpanded = expandedChannelPriceId === channel.id;
              return (
                <View className="border-b border-line py-2" key={channel.id}>
                  <View className="min-h-12 flex-row items-center">
                    <Pressable
                      accessibilityRole="switch"
                      accessibilityState={{ checked: isSelected }}
                      accessibilityLabel={t('recipes.selectSalesChannel', {
                        name: channel.name,
                      })}
                      onPress={() => toggleChannel(channel.id)}
                      className="min-h-12 flex-1 flex-row items-center justify-between">
                      <View className="flex-1 gap-1">
                        <Text className="text-base font-semibold text-ink">{channel.name}</Text>
                        <Text className="text-sm text-muted">
                          {t('recipes.channelFeesSummary', {
                            commission: channel.commissionPct,
                            payment: channel.paymentFeePct,
                          })}
                        </Text>
                      </View>
                      <Text className="ms-3 text-base font-semibold text-brand">
                        {isSelected ? t('settings.on') : t('settings.off')}
                      </Text>
                    </Pressable>
                    {isSelected ? (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={t('recipes.editChannelPrice', {
                          name: channel.name,
                        })}
                        onPress={() => setExpandedChannelPriceId(channel.id)}
                        className="ms-2 min-h-12 justify-center px-2">
                        <Text className="text-sm font-semibold text-brand">
                          {t('settings.edit')}
                        </Text>
                      </Pressable>
                    ) : null}
                  </View>
                  {isSelected && isPriceExpanded ? (
                    <View className="pb-3 pt-2">
                      <TextField
                        label={t('recipes.channelPrice', { name: channel.name })}
                        value={channelPriceValues[channel.id] ?? ''}
                        onChangeText={(value) => {
                          setChannelPriceValues((current) => ({
                            ...current,
                            [channel.id]: value,
                          }));
                          setFormErrors((current) => ({
                            ...current,
                            channelPrices: undefined,
                          }));
                        }}
                        onBlur={() =>
                          setChannelPriceValues((current) => ({
                            ...current,
                            [channel.id]: formatDecimalInput(
                              current[channel.id] ?? '',
                              locale,
                            ),
                          }))
                        }
                        keyboardType="decimal-pad"
                        prefix={priceAffixes.prefix}
                        suffix={priceAffixes.suffix}
                      />
                    </View>
                  ) : null}
                </View>
              );
            })}
            {formErrors.channelPrices ? (
              <Text accessibilityRole="alert" className="text-sm text-bad">
                {formErrors.channelPrices}
              </Text>
            ) : null}
          </View>
        ) : null}

        <View className="gap-2">
          <View className="flex-row items-center justify-between">
            <Text className="text-base font-semibold text-ink">{t('recipes.items')}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('recipes.addItem')}
              onPress={() => openItemPicker()}
              className="min-h-12 justify-center px-3">
              <Text className="text-base font-semibold text-brand">{t('recipes.addItem')}</Text>
            </Pressable>
          </View>
          {items.length > 0 ? (
            items.map((item) => {
              const line = costPreview.result?.breakdown.find(
                (breakdown) => breakdown.id === item.id,
              );
              return (
                <RecipeItemRow
                  item={item}
                  name={resolveItemName(item)}
                  lineCost={line?.costPerPortion}
                  isSubRecipe={isSubRecipe}
                  currency={currency}
                  locale={locale}
                  key={item.id}
                  onPress={() => openItemPicker(item)}
                  onRemove={() => removeDraftItem(item)}
                />
              );
            })
          ) : (
            <Text className="text-base text-muted">{t('recipes.noItems')}</Text>
          )}
          {formErrors.items ? (
            <Text accessibilityRole="alert" className="text-sm text-bad">
              {formErrors.items}
            </Text>
          ) : null}
        </View>
        {removedItem ? (
          <View className="min-h-12 flex-row items-center justify-between rounded-xl border border-line bg-surface px-3">
            <Text className="flex-1 text-sm text-ink">
              {t('recipes.itemRemoved', { name: resolveItemName(removedItem) })}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('recipes.undoRemove')}
              onPress={undoRemoveDraftItem}
              className="ms-2 min-h-12 justify-center px-2">
              <Text className="text-sm font-semibold text-brand">{t('recipes.undoRemove')}</Text>
            </Pressable>
          </View>
        ) : null}

        <View className="border-t border-line pt-2">
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: isMoreOptionsOpen }}
            accessibilityLabel={t('recipes.moreOptions')}
            onPress={() => setIsMoreOptionsOpen((open) => !open)}
            className="min-h-12 flex-row items-center justify-between">
            <Text className="text-base font-semibold text-ink">{t('recipes.moreOptions')}</Text>
            <SymbolView
              name={
                isMoreOptionsOpen
                  ? { ios: 'chevron.up', android: 'expand_less', web: 'expand_less' }
                  : { ios: 'chevron.down', android: 'expand_more', web: 'expand_more' }
              }
              tintColor={Colors.light.text}
              size={22}
            />
          </Pressable>
          {isMoreOptionsOpen ? (
            <View className="gap-4 pb-2 pt-3">
              <TextField
                label={t('recipes.laborMinutes')}
                value={laborMinutes}
                onChangeText={(value) => {
                  setLaborMinutes(value);
                  setFormErrors((current) => ({ ...current, laborMinutes: undefined }));
                }}
                onBlur={() => setLaborMinutes(formatDecimalInput(laborMinutes, locale))}
                keyboardType="decimal-pad"
                error={formErrors.laborMinutes}
              />
              <TextField
                label={t('recipes.hourlyRate')}
                value={laborRate}
                onChangeText={(value) => {
                  setLaborRate(value);
                  setFormErrors((current) => ({ ...current, laborRate: undefined }));
                }}
                onBlur={() => setLaborRate(formatDecimalInput(laborRate, locale))}
                keyboardType="decimal-pad"
                prefix={priceAffixes.prefix}
                suffix={priceAffixes.suffix}
                error={formErrors.laborRate}
              />
              <View className="gap-2">
                <Text className="text-sm font-semibold text-ink">{t('recipes.overhead')}</Text>
                <View className="flex-row flex-wrap gap-2">
                  {(['none', 'flat', 'percent'] as const).map((mode) => (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityState={{ selected: overheadMode === mode }}
                      accessibilityLabel={t(`recipes.${mode}Overhead`)}
                      onPress={() => setOverheadMode(mode)}
                      key={mode}
                      className={`min-h-12 items-center justify-center rounded-xl border px-3 ${
                        overheadMode === mode
                          ? 'border-ink bg-surface'
                          : 'border-line bg-surface'
                      }`}>
                      <Text className="text-sm text-ink">{t(`recipes.${mode}Overhead`)}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
              {overheadMode !== 'none' ? (
                <TextField
                  label={t('recipes.overheadValue')}
                  value={overheadValue}
                  onChangeText={(value) => {
                    setOverheadValue(value);
                    setFormErrors((current) => ({ ...current, overhead: undefined }));
                  }}
                  onBlur={() => setOverheadValue(formatDecimalInput(overheadValue, locale))}
                  keyboardType="decimal-pad"
                  prefix={overheadMode === 'flat' ? priceAffixes.prefix : undefined}
                  suffix={overheadMode === 'flat' ? priceAffixes.suffix : '%'}
                  error={formErrors.overhead}
                />
              ) : null}
              <View className="gap-2">
                <Text className="text-sm font-semibold text-ink">{t('recipes.notes')}</Text>
                <TextInput
                  accessibilityLabel={t('recipes.notes')}
                  value={notes}
                  onChangeText={setNotes}
                  multiline
                  textAlignVertical="top"
                  className="min-h-24 rounded-xl border border-line bg-surface px-3 py-3 text-base text-ink"
                />
              </View>
            </View>
          ) : null}
        </View>
      </ScrollView>

      <RecipeCostSummary
        batchCost={costPreview.result?.batchCost}
        costPerUnit={
          costPreview.result
            ? isSubRecipe
              ? costPreview.result.costPerYieldUnit
              : costPreview.result.costPerPortion
            : undefined
        }
        profitPerPortion={profitPerPortion}
        profitChannelName={previewChannel?.channel?.name}
        isSubRecipe={isSubRecipe}
        error={costPreview.error}
        currency={currency}
        locale={locale}
      />
      {costPreview.result && !isSubRecipe && previewPriceMinor === null ? (
        <Text className="bg-surface px-4 pb-2 text-sm text-muted">
          {t('recipes.noPriceYet')}
        </Text>
      ) : null}
      <View
        className="border-t border-line bg-bg px-4 pt-3"
        style={{ paddingBottom: Math.max(12, insets.bottom) }}>
        <Button
          label={isNew ? t('recipes.saveRecipe') : t('recipes.saveChanges')}
          onPress={() => void validateAndSave()}
          disabled={!isReady || isSaving}
        />
      </View>

      {workspace && isItemPickerOpen ? (
        <RecipeItemPickerSheet
          visible={isItemPickerOpen}
          onClose={() => {
            setIsItemPickerOpen(false);
            setEditingItem(undefined);
          }}
          onAdd={addItemToDraft}
          onCreatePackaging={handleCreatePackaging}
          ingredients={workspace.ingredients}
          conversionsByIngredient={workspace.conversionsByIngredient}
          recipes={workspace.recipes}
          packagingItems={workspace.packagingItems}
          recipeEdges={selectedRecipeEdges}
          currentRecipeId={isNew ? undefined : id}
          initialItem={editingItem}
          draftItems={items}
          currency={currency}
          locale={locale}
          unitSystem={workspace.settings.unitSystem}
          unitSizes={workspace.unitSizes}
        />
      ) : null}
    </SafeAreaView>
  );
}
