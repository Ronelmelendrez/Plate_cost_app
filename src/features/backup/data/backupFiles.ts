import { File, Paths } from 'expo-file-system';
import * as DocumentPicker from 'expo-document-picker';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

import type { AppDatabase } from '@core/db/client';

import { createBackup, mergeBackup } from './backupRepository';
import { BackupValidationError, parseBackup } from '../domain/backupFormat';

export class SharingUnavailableError extends Error {
  constructor() {
    super('Sharing is not available on this device.');
    this.name = 'SharingUnavailableError';
  }
}

export async function shareBackupFile(database: AppDatabase, dialogTitle: string) {
  if (!(await Sharing.isAvailableAsync())) {
    throw new SharingUnavailableError();
  }
  const backup = await createBackup(database);
  const file = new File(
    Paths.cache,
    `platecost-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
  );
  file.create({ overwrite: true });
  await file.write(JSON.stringify(backup, null, 2));
  await Sharing.shareAsync(file.uri, {
    dialogTitle,
    mimeType: 'application/json',
  });
}

export async function pickAndMergeBackup(database: AppDatabase) {
  const selection = await DocumentPicker.getDocumentAsync({
    type: ['application/json', 'text/json'],
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (selection.canceled) {
    return null;
  }

  const asset = selection.assets[0];
  if (!asset || (asset.size !== undefined && asset.size > 20_000_000)) {
    throw new BackupValidationError();
  }

  const text = await new File(asset.uri).text();
  const backup = parseBackup(text);
  return mergeBackup(database, backup);
}

export async function sharePdfFile(html: string, dialogTitle: string) {
  if (!(await Sharing.isAvailableAsync())) {
    throw new SharingUnavailableError();
  }
  const { uri } = await Print.printToFileAsync({ html });
  await Sharing.shareAsync(uri, { dialogTitle, mimeType: 'application/pdf' });
}
