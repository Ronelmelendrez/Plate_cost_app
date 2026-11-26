import '../global.css';

import { DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { SQLiteProvider } from 'expo-sqlite';
import 'react-native-reanimated';

import '@shared/i18n';
import { migrateDbIfNeeded } from '@core/db/migrations';

export {
  // Catch any errors thrown by the Layout component.
  ErrorBoundary,
} from 'expo-router';

export default function RootLayout() {
  return (
    <SQLiteProvider databaseName="platecost.db" onInit={migrateDbIfNeeded}>
      <ThemeProvider value={DefaultTheme}>
        <Stack screenOptions={{ headerShown: false }} />
      </ThemeProvider>
    </SQLiteProvider>
  );
}
