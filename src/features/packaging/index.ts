// Public API of the packaging feature.
export { default as PackagingDetailScreen } from './screens/PackagingDetailScreen';
export { PackagingPicker } from './components/PackagingPicker';
export { PackagingRow } from './components/PackagingRow';
export { ChannelChips } from './components/ChannelChips';
export {
  getPackagingItem,
  listPackagingItems,
  markPackagingRecent,
  savePackagingItem,
  setPackagingFavourite,
} from './data/packagingRepository';
export type {
  PackagingInput,
  PackagingItem,
  RecipePackagingDraft,
} from './types';
