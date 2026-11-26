export const BACKUP_REMINDER_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;

export interface BackupReminderSchedule {
  lastBackupAt: string | null;
  backupReminderSnoozedUntil: string | null;
}

export type BackupReminderKind = 'first' | 'weekly';

export function getBackupReminderKind(
  schedule: BackupReminderSchedule,
  dishCount: number,
  now: Date = new Date(),
): BackupReminderKind | null {
  if (dishCount < 1) {
    return null;
  }

  const nowMs = now.getTime();
  const snoozedUntil = schedule.backupReminderSnoozedUntil
    ? Date.parse(schedule.backupReminderSnoozedUntil)
    : Number.NaN;
  if (Number.isFinite(snoozedUntil) && snoozedUntil > nowMs) {
    return null;
  }

  if (!schedule.lastBackupAt) {
    return 'first';
  }

  const lastBackup = Date.parse(schedule.lastBackupAt);
  if (!Number.isFinite(lastBackup) || nowMs - lastBackup >= BACKUP_REMINDER_INTERVAL_MS) {
    return 'weekly';
  }
  return null;
}
