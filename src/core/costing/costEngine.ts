import { Decimal } from 'decimal.js';

import {
  costPerUsableBaseUnit,
  quantityInBaseUnits,
  UnitMismatchError,
  type BaseUnit,
  type PurchaseUnit,
  type RecipeUnit,
  type RecipeUnitSizes,
  type RecipeYieldUnit,
  DEFAULT_RECIPE_UNIT_SIZES,
} from './units';

export interface IngredientConversionInput {
  fromUnit: string;
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

export interface RecipePackagingInput {
  id: string;
  name: string;
  costMinor: number;
}

export interface RecipeCostLine {
  id: string;
  kind: 'ingredient' | 'recipe' | 'packaging';
  name: string;
  quantity: string;
  unit: RecipeUnit;
  detail?: RecipeCostInput;
  ingredient?: RecipeIngredientInput;
  packaging?: RecipePackagingInput;
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
  items: RecipeCostLine[];
}

export interface CostBreakdownLine {
  id: string;
  kind: RecipeCostLine['kind'];
  name: string;
  quantity: string;
  unit: RecipeUnit;
  costPerPortion: Decimal;
}

export interface RecipeCostResult {
  batchCost: Decimal;
  costPerPortion: Decimal;
  costPerYieldUnit: Decimal;
  portions: number;
  breakdown: CostBreakdownLine[];
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
    const ingredientBaseUnit = quantityInBaseUnits('1', line.ingredient.purchaseUnit).unit;
    if (ingredientBaseUnit !== baseQuantity.unit) {
      throw new UnitMismatchError();
    }
    return costPerUsableBaseUnit({
      priceMinor: line.ingredient.purchasePriceMinor,
      fractionDigits,
      purchaseQuantity: line.ingredient.purchaseQuantity,
      purchaseUnit: line.ingredient.purchaseUnit,
      usableYieldPct: line.ingredient.usableYieldPct,
    }).mul(baseQuantity.quantity);
  }

  if (line.kind === 'recipe') {
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
      throw new UnitMismatchError();
    }
    return nestedCost.costPerYieldUnit.mul(amount.quantity);
  }

  if (!line.packaging) {
    throw new MissingRecipeReferenceError();
  }
  const packageQuantity = quantityInBaseUnits(line.quantity, line.unit);
  if (packageQuantity.unit !== 'pc') {
    throw new UnitMismatchError();
  }
  return new Decimal(line.packaging.costMinor)
    .div(new Decimal(10).pow(fractionDigits))
    .mul(packageQuantity.quantity);
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

  const wastePercent = new Decimal(wastePct);
  if (wastePercent.lt(0)) {
    throw new Error('Waste buffer cannot be negative.');
  }
  const laborMinutes = new Decimal(recipe.laborMinutes);
  const overheadValue = new Decimal(recipe.overheadValue);
  if (
    laborMinutes.lt(0) ||
    recipe.laborRateMinor < 0 ||
    overheadValue.lt(0)
  ) {
    throw new Error('Labor and overhead values cannot be negative.');
  }

  const wasteFactor = new Decimal(1).plus(wastePercent.div(100));
  const componentLines = recipe.items.filter((line) => line.kind !== 'packaging');
  const packagingLines = recipe.items.filter((line) => line.kind === 'packaging');
  const ingredientSubtotal = componentLines.reduce(
    (total, line) =>
      total.plus(recipeItemCost(line, fractionDigits, ancestry, wastePct, unitSizes)),
    new Decimal(0),
  );
  const packagingPerPortion = packagingLines.reduce(
    (total, line) =>
      total.plus(recipeItemCost(line, fractionDigits, ancestry, wastePct, unitSizes)),
    new Decimal(0),
  );
  const laborCost = laborMinutes
    .mul(recipe.laborRateMinor)
    .div(60)
    .div(new Decimal(10).pow(fractionDigits));
  const portions = recipe.isSubRecipe ? 1 : recipe.portions;
  const materialPerPortion = ingredientSubtotal.mul(wasteFactor).div(portions);
  let overheadPerPortion = new Decimal(0);
  if (recipe.overheadMode === 'flat') {
    overheadPerPortion = overheadValue;
  } else if (recipe.overheadMode === 'percent') {
    overheadPerPortion = materialPerPortion
      .plus(packagingPerPortion)
      .mul(overheadValue)
      .div(100);
  }
  const costPerPortion = materialPerPortion
    .plus(packagingPerPortion)
    .plus(laborCost.div(portions))
    .plus(overheadPerPortion);
  const batchCost = costPerPortion.mul(portions);
  const yieldAmount = recipe.isSubRecipe ? batchYieldQuantity : new Decimal(recipe.portions);
  const batchYieldInBaseUnits = recipe.isSubRecipe
    ? quantityInBaseUnits(batchYieldQuantity.toString(), recipe.batchYieldUnit, undefined, unitSizes)
        .quantity
    : yieldAmount;
  const costPerYieldUnit = batchCost.div(batchYieldInBaseUnits);

  const breakdown: CostBreakdownLine[] = recipe.items.map((line) => {
    const lineCost = recipeItemCost(line, fractionDigits, ancestry, wastePct, unitSizes);
    return {
      id: line.id,
      kind: line.kind,
      name: line.name,
      quantity: line.quantity,
      unit: line.unit,
      costPerPortion:
        line.kind === 'packaging'
          ? lineCost
          : lineCost.mul(wasteFactor).div(portions),
    };
  });
  return { batchCost, costPerPortion, costPerYieldUnit, portions, breakdown };
}

export function calculateRecipeCost(
  recipe: RecipeCostInput,
  wastePct: string,
  fractionDigits: number,
  unitSizes: RecipeUnitSizes = DEFAULT_RECIPE_UNIT_SIZES,
) {
  return computeRecipeCost(recipe, wastePct, fractionDigits, new Set([recipe.id]), unitSizes);
}
