// Public API of the onboarding feature. Other features import from here only.
export { default as OnboardingScreen } from './screens/OnboardingScreen';
export { default as OnboardingEntryScreen } from './screens/OnboardingEntryScreen';
export {
  completeOnboarding,
  ensureStarterChannels,
  isOnboardingCompleted,
  saveOnboardingDish,
} from './data/onboardingRepository';
export { getStarterIngredients, getStarterTemplates } from './data/starterTemplates';
export type { OnboardingDishInput } from './data/onboardingRepository';
export type {
  StarterChannelTemplate,
  StarterIngredientTemplate,
  StarterPackagingTemplate,
  StarterTemplateCatalog,
} from './data/starterTemplates';
