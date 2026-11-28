import { Decimal } from 'decimal.js';

import {
  costPerUsableBaseUnit,
  quantityInBaseUnits,
  FamilyMismatchError,
  purchaseBaseUnit,
  type BaseUnit,
  type ConversionUnit,
  type PurchaseUnit,
  type RecipeUnit,
  type RecipeUnitSizes,
  type RecipeYieldUnit,
  DEFAULT_RECIPE_UNIT_SIZES,
} from './units';

export interface IngredientConversionInput {
  fromUnit: ConversionUnit;
  baseQuantity: string;
  baseUnit: BaseUnit;
}

export interface RecipeIngredientInput {
  id: string;
  name: string;
  purchaseUnit: PurchaseUnit;
  purchaseQuantity: string;
  purchasePriceMinor: number;
  usableYieldPct: string;
  conversions: IngredientConversionInput[];
}

export interface RecipeCostLine {
  id: string;
  kind: 'ingredient' | 'recipe';
  name: string;
  quantity: string;
  unit: RecipeUnit;
  detail?: RecipeCostInput;
  ingredient?: RecipeIngredientInput;
}

export interface RecipePackagingCostLine {
  id: string;
  packagingId: string;
  name: string;
  quantityPerPortion: string;
  packPriceMinor: number;
  piecesPerPack: number;
  appliesTo: 'all' | 'selected';
  channelIds: string[];
}

export interface RecipeCostInput {
  id: string;
  isSubRecipe: boolean;
  portions: number;
  batchYieldQuantity: string;
  batchYieldUnit: RecipeYieldUnit;
  laborMinutes: string;
  laborRateMinor: number;
  overheadMode: 'none' | 'flat' | 'percent';
  overheadValue: string;
  channelIds: string[];
  items: RecipeCostLine[];
  packaging: RecipePackagingCostLine[];
}

export interface CostBreakdownLine {
  id: string;
  kind: RecipeCostLine['kind'];
  name: string;
  quantity: string;
  unit: RecipeUnit;
  costPerPortion: Decimal;
  ingredientCalculation?: {
    quantity: Decimal;
    unit: BaseUnit;
    costPerBaseUnit: Decimal;
    lineCost: Decimal;
  };
  subRecipeCalculation?: {
    quantity: Decimal;
    unit: BaseUnit;
    costPerBaseUnit: Decimal;
    lineCost: Decimal;
  };
}

export interface PackagingCostBreakdownLine {
  id: string;
  name: string;
  quantityPerPortion: string;
  costPerPortion: Decimal;
}

export interface RecipeCostResult {
  batchFoodCost: Decimal;
  foodCostPerPortion: Decimal;
  foodCostPerYieldUnit: Decimal;
  packagingCostByChannel: Record<string, Decimal>;
  portions: number;
  breakdown: CostBreakdownLine[];
  packagingBreakdownByChannel: Record<string, PackagingCostBreakdownLine[]>;
}

export class MissingRecipeReferenceError extends Error {
  constructor() {
    super('A recipe item no longer exists. Remove it and add it again.');
    this.name = 'MissingRecipeReferenceError';
  }
}

export class RecipeCycleError extends Error {
  constructor() {
    super('A recipe cannot contain itself through another recipe.');
    this.name = 'RecipeCycleError';
  }
}

export class InvalidSubRecipeError extends Error {
  constructor() {
    super('Only a sub-recipe can be used as an item in another recipe.');
    this.name = 'InvalidSubRecipeError';
  }
}

export class InvalidPackagingOnSubRecipeError extends Error {
  constructor() {
    super('Packaging can only be added to a dish, not a sub-recipe.');
    this.name = 'InvalidPackagingOnSubRecipeError';
  }
}

function ingredientCostCalculation(
  line: RecipeCostLine,
  fractionDigits: number,
  unitSizes: RecipeUnitSizes,
) {
  if (!line.ingredient) {
    throw new MissingRecipeReferenceError();
  }
  const customConversion = line.ingredient.conversions.find(
    (conversion) => conversion.fromUnit === line.unit,
  );
  const baseQuantity = quantityInBaseUnits(
    line.quantity,
    line.unit,
    customConversion
      ? { baseQuantity: customConversion.baseQuantity, baseUnit: customConversion.baseUnit }
      : undefined,
    unitSizes,
  );
  const purchaseConversion = line.ingredient.conversions.find(
    (conversion) => conversion.fromUnit === line.ingredient?.purchaseUnit,
  );
  const ingredientBaseUnit = purchaseBaseUnit(
    line.ingredient.purchaseUnit,
    purchaseConversion,
  );
  if (ingredientBaseUnit !== baseQuantity.unit) {
    throw new FamilyMismatchError(line.unit, line.ingredient.purchaseUnit);
  }
  const costPerBaseUnit = costPerUsableBaseUnit({
    priceMinor: line.ingredient.purchasePriceMinor,
    fractionDigits,
    purchaseQuantity: line.ingredient.purchaseQuantity,
    purchaseUnit: line.ingredient.purchaseUnit,
    usableYieldPct: line.ingredient.usableYieldPct,
    conversion: purchaseConversion,
    unitSizes,
  });
  return {
    quantity: baseQuantity.quantity,
    unit: baseQuantity.unit,
    costPerBaseUnit,
    lineCost: costPerBaseUnit.mul(baseQuantity.quantity),
  };
}

export function packagingCostPerPortion(
  lines: RecipePackagingCostLine[],
  channelId: string,
  fractionDigits: number,
) {
  const scale = new Decimal(10).pow(fractionDigits);
  return lines.reduce((total, line) => {
    const quantity = new Decimal(line.quantityPerPortion);
    if (quantity.lt(0) || line.piecesPerPack < 1 || line.packPriceMinor < 0) {
      throw new Error('Packaging quantities, pack sizes, and prices must be non-negative.');
    }
    if (line.appliesTo === 'selected' && !line.channelIds.includes(channelId)) {
      return total;
    }
    return total.plus(
      new Decimal(line.packPriceMinor).div(scale).div(line.piecesPerPack).mul(quantity),
    );
  }, new Decimal(0));
}

export function recipeItemCost(
  line: RecipeCostLine,
  fractionDigits: number,
  ancestry: Set<string> = new Set(),
  wastePct = '5',
  unitSizes: RecipeUnitSizes = DEFAULT_RECIPE_UNIT_SIZES,
): Decimal {
  const quantity = new Decimal(line.quantity);
  if (quantity.lte(0)) {
    throw new Error('Recipe item quantity must be greater than zero.');
  }

  if (line.kind === 'ingredient') {
    return ingredientCostCalculation(line, fractionDigits, unitSizes).lineCost;
  }

  if (!line.detail) {
    throw new MissingRecipeReferenceError();
  }
  if (!line.detail.isSubRecipe) {
    throw new InvalidSubRecipeError();
  }
  if (ancestry.has(line.detail.id)) {
    throw new RecipeCycleError();
  }
  const nestedCost = computeRecipeCost(
    line.detail,
    wastePct,
    fractionDigits,
    new Set([...ancestry, line.detail.id]),
    unitSizes,
  );
  const amount = quantityInBaseUnits(line.quantity, line.unit, undefined, unitSizes);
  const yieldUnit = quantityInBaseUnits('1', line.detail.batchYieldUnit, undefined, unitSizes).unit;
  if (amount.unit !== yieldUnit) {
    throw new FamilyMismatchError(line.unit, line.detail.batchYieldUnit);
  }
  return nestedCost.foodCostPerYieldUnit.mul(amount.quantity);
}

function computeRecipeCost(
  recipe: RecipeCostInput,
  wastePct: string,
  fractionDigits: number,
  ancestry: Set<string>,
  unitSizes: RecipeUnitSizes,
): RecipeCostResult {
  if (recipe.portions < 1) {
    throw new Error('A recipe must have at least one portion.');
  }
  const batchYieldQuantity = new Decimal(recipe.batchYieldQuantity);
  if (batchYieldQuantity.lte(0)) {
    throw new Error('Batch yield must be greater than zero.');
  }
  if (recipe.isSubRecipe && recipe.packaging.length > 0) {
    throw new InvalidPackagingOnSubRecipeError();
  }

  const wastePercent = new Decimal(wastePct);
  if (wastePercent.lt(0)) {
    throw new Error('Waste buffer cannot be negative.');
  }
  const laborMinutes = new Decimal(recipe.laborMinutes);
  const overheadValue = new Decimal(recipe.overheadValue);
  if (laborMinutes.lt(0) || recipe.laborRateMinor < 0 || overheadValue.lt(0)) {
    throw new Error('Labor and overhead values cannot be negative.');
  }

  const wasteFactor = new Decimal(1).plus(wastePercent.div(100));
  const materialSubtotal = recipe.items.reduce((total, line) => {
    const lineCost = recipeItemCost(line, fractionDigits, ancestry, wastePct, unitSizes);
    return total.plus(line.kind === 'ingredient' ? lineCost.mul(wasteFactor) : lineCost);
  }, new Decimal(0));
  const laborCost = new Decimal(laborMinutes)
    .mul(recipe.laborRateMinor)
    .div(60)
    .div(new Decimal(10).pow(fractionDigits));
  const portions = recipe.isSubRecipe ? 1 : recipe.portions;
  const materialPerPortion = materialSubtotal.div(portions);
  let overheadPerPortion = new Decimal(0);
  if (recipe.overheadMode === 'flat') {
    overheadPerPortion = overheadValue;
  } else if (recipe.overheadMode === 'percent') {
    overheadPerPortion = materialPerPortion.mul(overheadValue).div(100);
  }
  const foodCostPerPortion = materialPerPortion
    .plus(laborCost.div(portions))
    .plus(overheadPerPortion);
  const batchFoodCost = foodCostPerPortion.mul(portions);
  const yieldAmount = recipe.isSubRecipe ? batchYieldQuantity : new Decimal(recipe.portions);
  const batchYieldInBaseUnits = recipe.isSubRecipe
    ? quantityInBaseUnits(batchYieldQuantity.toString(), recipe.batchYieldUnit, undefined, unitSizes)
        .quantity
    : yieldAmount;
  const foodCostPerYieldUnit = batchFoodCost.div(batchYieldInBaseUnits);

  const packagingCostByChannel: Record<string, Decimal> = {};
  const packagingBreakdownByChannel: Record<string, PackagingCostBreakdownLine[]> = {};
  for (const channelId of recipe.channelIds) {
    const channelLines = recipe.packaging.filter(
      (line) => line.appliesTo === 'all' || line.channelIds.includes(channelId),
    );
    packagingCostByChannel[channelId] = packagingCostPerPortion(
      channelLines,
      channelId,
      fractionDigits,
    );
    packagingBreakdownByChannel[channelId] = channelLines.map((line) => ({
      id: line.id,
      name: line.name,
      quantityPerPortion: line.quantityPerPortion,
      costPerPortion: packagingCostPerPortion([line], channelId, fractionDigits),
    }));
  }

  const breakdown: CostBreakdownLine[] = recipe.items.map((line) => {
    const lineCost = recipeItemCost(line, fractionDigits, ancestry, wastePct, unitSizes);
    const ingredientCalculation =
      line.kind === 'ingredient'
        ? ingredientCostCalculation(line, fractionDigits, unitSizes)
        : undefined;
    const subRecipeCalculation =
      line.kind === 'recipe'
        ? (() => {
            const amount = quantityInBaseUnits(
              line.quantity,
              line.unit,
              undefined,
              unitSizes,
            );
            return {
              quantity: amount.quantity,
              unit: amount.unit,
              costPerBaseUnit: lineCost.div(amount.quantity),
              lineCost,
            };
          })()
        : undefined;
    return {
      id: line.id,
      kind: line.kind,
      name: line.name,
      quantity: line.quantity,
      unit: line.unit,
      costPerPortion: (line.kind === 'ingredient' ? lineCost.mul(wasteFactor) : lineCost)
        .div(portions),
      ingredientCalculation,
      subRecipeCalculation,
    };
  });
  return {
    batchFoodCost,
    foodCostPerPortion,
    foodCostPerYieldUnit,
    packagingCostByChannel,
    portions,
    breakdown,
    packagingBreakdownByChannel,
  };
}

export function calculateRecipeCost(
  recipe: RecipeCostInput,
  wastePct: string,
  fractionDigits: number,
  unitSizes: RecipeUnitSizes = DEFAULT_RECIPE_UNIT_SIZES,
) {
  return computeRecipeCost(recipe, wastePct, fractionDigits, new Set([recipe.id]), unitSizes);
}
