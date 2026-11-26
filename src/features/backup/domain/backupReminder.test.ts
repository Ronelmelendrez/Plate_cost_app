import { describe, expect, it } from 'vitest';

import {
  BACKUP_REMINDER_INTERVAL_MS,
  getBackupReminderKind,
} from './backupReminder';

const now = new Date('2025-01-15T12:00:00.000Z');

describe('backup reminder schedule', () => {
  it('prompts after the first saved dish and does not prompt before one exists', () => {
    const schedule = { lastBackupAt: null, backupReminderSnoozedUntil: null };

    expect(getBackupReminderKind(schedule, 0, now)).toBeNull();
    expect(getBackupReminderKind(schedule, 1, now)).toBe('first');
  });

  it('reminds weekly after a backup and respects a one-week snooze', () => {
    const schedule = {
      lastBackupAt: new Date(now.getTime() - BACKUP_REMINDER_INTERVAL_MS).toISOString(),
      backupReminderSnoozedUntil: new Date(
        now.getTime() + BACKUP_REMINDER_INTERVAL_MS,
      ).toISOString(),
    };

    expect(getBackupReminderKind(schedule, 1, now)).toBeNull();
    expect(
      getBackupReminderKind(
        { ...schedule, backupReminderSnoozedUntil: null },
        1,
        now,
      ),
    ).toBe('weekly');
  });
});
