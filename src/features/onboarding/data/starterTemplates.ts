import englishTemplates from '../templates/en.json';

import type { PurchaseUnit, RecipeUnit } from '@core/costing/units';

type Measure = { quantity: string; unit: string };
type UnitSystem = 'metric' | 'us';

interface IngredientTemplateSource {
  id: string;
  name: string;
  purchase: Record<UnitSystem, Measure>;
  recipeUsage: Record<UnitSystem, Measure>;
}

export interface StarterIngredientTemplate {
  id: string;
  name: string;
  purchaseQuantity: string;
  purchaseUnit: PurchaseUnit;
  recipeQuantity: string;
  recipeUnit: RecipeUnit;
}

export interface StarterPackagingTemplate {
  id: string;
  name: string;
}

export interface StarterChannelTemplate {
  id: string;
  name: string;
  commissionPct: string;
  paymentFeePct: string;
  isDefault: boolean;
}

export interface StarterTemplateCatalog {
  ingredients: IngredientTemplateSource[];
  packaging: StarterPackagingTemplate[];
  channels: StarterChannelTemplate[];
}

const templatesByLanguage: Record<string, StarterTemplateCatalog> = {
  en: englishTemplates,
};

export function getStarterTemplates(locale: string): StarterTemplateCatalog {
  const language = locale.split(/[-_]/)[0].toLowerCase();
  return templatesByLanguage[language] ?? englishTemplates;
}

export function getStarterIngredients(
  locale: string,
  unitSystem: UnitSystem,
): StarterIngredientTemplate[] {
  return getStarterTemplates(locale).ingredients.map((ingredient) => ({
    id: ingredient.id,
    name: ingredient.name,
    purchaseQuantity: ingredient.purchase[unitSystem].quantity,
    purchaseUnit: ingredient.purchase[unitSystem].unit as PurchaseUnit,
    recipeQuantity: ingredient.recipeUsage[unitSystem].quantity,
    recipeUnit: ingredient.recipeUsage[unitSystem].unit as RecipeUnit,
  }));
}
