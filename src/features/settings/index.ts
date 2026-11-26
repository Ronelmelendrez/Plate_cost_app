// Public API of the settings feature. Other features import from here only.
export { default as SettingsScreen } from './screens/SettingsScreen';
export {
  getAppSettings,
  listSalesChannels,
  saveSettings,
  validateSettingsDraft,
} from './data/settingsRepository';
export type {
  AppSettings,
  AppSettingsDraft,
  SalesChannel,
  SalesChannelDraft,
} from './data/settingsRepository';
