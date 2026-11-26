import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { createDrizzleClient } from '@core/db/client';
import { currencyFractionDigits, formatDecimalInput } from '@core/costing/money';
import {
  BackupValidationError,
  pickAndMergeBackup,
  recordBackupExport,
  shareBackupFile,
  SharingUnavailableError,
} from '@features/backup';
import {
  getAvailableRoundingRules,
  getDefaultRoundingRule,
} from '@core/costing/suggestedPrice';
import {
  getAppSettings,
  listSalesChannels,
  saveSettings,
  validateSettingsDraft,
  type AppSettingsDraft,
  type SalesChannelDraft,
} from '@features/settings/data/settingsRepository';
import { ChannelSettingsRow } from '@features/settings/components/ChannelSettingsRow';
import { Button, TextField } from '@shared/ui';

export default function SettingsScreen() {
  const sqlite = useSQLiteContext();
  const database = useMemo(() => createDrizzleClient(sqlite), [sqlite]);
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [settings, setSettings] = useState<AppSettingsDraft | null>(null);
  const [savedCurrencyCode, setSavedCurrencyCode] = useState('');
  const [channels, setChannels] = useState<SalesChannelDraft[]>([]);
  const [expandedChannelId, setExpandedChannelId] = useState<string>();
  const [isMoreOptionsOpen, setIsMoreOptionsOpen] = useState(false);
  const [isTaxOpen, setIsTaxOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [formError, setFormError] = useState('');
  const [isSaved, setIsSaved] = useState(false);
  const [backupError, setBackupError] = useState('');
  const [backupMessage, setBackupMessage] = useState('');
  const [isBackupBusy, setIsBackupBusy] = useState(false);

  const loadSettings = useCallback(async () => {
    setLoadError('');
    setIsLoading(true);
    try {
      const [storedSettings, storedChannels] = await Promise.all([
        getAppSettings(database),
        listSalesChannels(database),
      ]);
      const draft: AppSettingsDraft = {
        locale: storedSettings.locale,
        currencyCode: storedSettings.currencyCode,
        unitSystem: storedSettings.unitSystem,
        cupMl: storedSettings.cupMl,
        tablespoonMl: storedSettings.tablespoonMl,
        pricesIncludeTax: storedSettings.pricesIncludeTax,
        taxPct: storedSettings.taxPct,
        wastePct: storedSettings.wastePct,
        targetMarginPct: storedSettings.targetMarginPct,
        feesOnTaxIncludedPrice: storedSettings.feesOnTaxIncludedPrice,
        roundingRule:
          storedSettings.roundingRule === 'auto'
            ? getDefaultRoundingRule(storedSettings.currencyCode, storedSettings.locale)
            : storedSettings.roundingRule,
      };
      setSettings(draft);
      setSavedCurrencyCode(storedSettings.currencyCode);
      setChannels(
        storedChannels.map((channel) => ({
          id: channel.id,
          name: channel.name,
          commissionPct: channel.commissionPct,
          paymentFeePct: channel.paymentFeePct,
          isDefault: channel.isDefault,
        })),
      );
      setIsReady(true);
    } catch (error) {
      console.error('Unable to load settings.', error);
      setLoadError(t('settings.loadError'));
    } finally {
      setIsLoading(false);
    }
  }, [database, t]);

  useFocusEffect(
    useCallback(() => {
      void loadSettings();
    }, [loadSettings]),
  );

  const updateSettings = (patch: Partial<AppSettingsDraft>) => {
    setIsSaved(false);
    setFormError('');
    setSettings((current) => (current ? { ...current, ...patch } : current));
  };

  const updateCurrencyCode = (value: string) => {
    if (!settings) {
      return;
    }
    const currencyCode = value.toUpperCase().slice(0, 3);
    updateSettings({
      currencyCode,
      ...(/^[A-Z]{3}$/.test(currencyCode)
        ? { roundingRule: getDefaultRoundingRule(currencyCode, settings.locale) }
        : {}),
    });
  };

  const updateChannel = (id: string, patch: Partial<SalesChannelDraft>) => {
    setIsSaved(false);
    setFormError('');
    setChannels((current) =>
      current.map((channel) => (channel.id === id ? { ...channel, ...patch } : channel)),
    );
  };

  const addChannel = () => {
    const id = `draft-${Date.now()}`;
    setChannels((current) => [
      ...current,
      { id, name: '', commissionPct: '0', paymentFeePct: '0', isDefault: false },
    ]);
    setExpandedChannelId(id);
    setIsSaved(false);
  };

  const handleSave = async () => {
    if (!settings) {
      return;
    }
    const drafts = channels.map((channel) =>
      channel.id?.startsWith('draft-') ? { ...channel, id: undefined } : channel,
    );
    const validation = validateSettingsDraft(settings, drafts);
    if (validation) {
      setFormError(t(`settings.${validation}Error`));
      return;
    }

    setIsSaving(true);
    setFormError('');
    try {
      await saveSettings(database, settings, drafts);
      setIsSaved(true);
      await loadSettings();
    } catch (error) {
      console.error('Unable to save settings.', error);
      setFormError(t('settings.saveError'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleBackupExport = async () => {
    setIsBackupBusy(true);
    setBackupError('');
    setBackupMessage('');
    try {
      await shareBackupFile(database, t('settings.backupShareTitle'));
      setBackupMessage(t('settings.backupCreated'));
      try {
        await recordBackupExport(database);
      } catch (error) {
        console.error('Unable to update the backup reminder after export.', error);
        setBackupError(t('settings.backupReminderSaveError'));
      }
    } catch (error) {
      console.error('Unable to create or share a backup.', error);
      setBackupError(
        error instanceof SharingUnavailableError
          ? t('settings.sharingUnavailable')
          : t('settings.backupExportError'),
      );
    } finally {
      setIsBackupBusy(false);
    }
  };

  const handleBackupImport = async () => {
    setIsBackupBusy(true);
    setBackupError('');
    setBackupMessage('');
    try {
      const result = await pickAndMergeBackup(database);
      if (!result) {
        return;
      }
      setBackupMessage(t('settings.backupMerged', { count: result.addedCount }));
      await loadSettings();
    } catch (error) {
      console.error('Unable to merge the selected backup.', error);
      setBackupError(
        error instanceof BackupValidationError
          ? t('settings.backupInvalid')
          : t('settings.backupImportError'),
      );
    } finally {
      setIsBackupBusy(false);
    }
  };

  if (isLoading && !settings) {
    return <SafeAreaView edges={['top']} className="flex-1 bg-bg" />;
  }

  const currencyForRounding =
    settings && /^[A-Z]{3}$/.test(settings.currencyCode)
      ? settings.currencyCode
      : savedCurrencyCode;
  const roundingRules = settings
    ? getAvailableRoundingRules(currencyFractionDigits(currencyForRounding, settings.locale))
    : [];

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-bg">
      <View className="px-4 pb-3 pt-1">
        <Text className="text-xl font-semibold text-ink">{t('settings.title')}</Text>
      </View>
      {loadError ? (
        <View className="flex-1 justify-center gap-3 px-4">
          <Text accessibilityRole="alert" className="text-base text-bad">
            {loadError}
          </Text>
          <Button label={t('settings.retry')} onPress={() => void loadSettings()} />
        </View>
      ) : settings ? (
        <>
          <ScrollView
            className="flex-1"
            contentContainerClassName="gap-6 px-4 pb-6"
            keyboardShouldPersistTaps="handled">
            {formError ? (
              <Text accessibilityRole="alert" className="text-base text-bad">
                {formError}
              </Text>
            ) : null}
            {isSaved ? (
              <Text accessibilityRole="summary" className="text-sm font-semibold text-good">
                {t('settings.saved')}
              </Text>
            ) : null}

            <View className="gap-4">
              <Text className="text-base font-semibold text-ink">
                {t('settings.costing')}
              </Text>
              <TextField
                label={t('settings.wasteBuffer')}
                value={settings.wastePct}
                onChangeText={(wastePct) => updateSettings({ wastePct })}
                onBlur={() =>
                  updateSettings({
                    wastePct: formatDecimalInput(settings.wastePct, settings.locale),
                  })
                }
                keyboardType="decimal-pad"
                suffix="%"
                helperText={t('settings.wasteHelp')}
              />
              <TextField
                label={t('settings.targetMargin')}
                value={settings.targetMarginPct}
                onChangeText={(targetMarginPct) => updateSettings({ targetMarginPct })}
                onBlur={() =>
                  updateSettings({
                    targetMarginPct: formatDecimalInput(
                      settings.targetMarginPct,
                      settings.locale,
                    ),
                  })
                }
                keyboardType="decimal-pad"
                suffix="%"
              />
            </View>

            <View className="gap-4 border-t border-line pt-4">
              <Text className="text-base font-semibold text-ink">
                {t('settings.currency')}
              </Text>
              <TextField
                label={t('settings.currencyCode')}
                value={settings.currencyCode}
                onChangeText={updateCurrencyCode}
                helperText={t('settings.currencyHelp')}
                accessibilityLabel={t('settings.currencyCode')}
              />
              {settings.currencyCode !== savedCurrencyCode ? (
                <Text className="text-sm text-muted">{t('settings.currencyWarning')}</Text>
              ) : null}
              <Text className="text-sm font-semibold text-ink">{t('settings.unitSystem')}</Text>
              <View className="flex-row gap-2">
                {(['metric', 'us'] as const).map((unitSystem) => (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ selected: settings.unitSystem === unitSystem }}
                    accessibilityLabel={t(`settings.${unitSystem}`)}
                    onPress={() => updateSettings({ unitSystem })}
                    key={unitSystem}
                    className={`min-h-12 flex-1 items-center justify-center rounded-xl border px-3 ${
                      settings.unitSystem === unitSystem
                        ? 'border-ink bg-surface'
                        : 'border-line bg-surface'
                    }`}>
                    <Text className="text-base text-ink">{t(`settings.${unitSystem}`)}</Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <View className="border-t border-line pt-2">
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded: isTaxOpen }}
                accessibilityLabel={t('settings.tax')}
                onPress={() => setIsTaxOpen((open) => !open)}
                className="min-h-12 flex-row items-center justify-between">
                <Text className="text-base font-semibold text-ink">{t('settings.tax')}</Text>
                <Text className="text-sm font-semibold text-brand">
                  {isTaxOpen ? t('settings.closeSection') : t('settings.edit')}
                </Text>
              </Pressable>
              {isTaxOpen ? (
                <View className="gap-4 pb-2 pt-3">
                  <Pressable
                    accessibilityRole="switch"
                    accessibilityState={{ checked: settings.pricesIncludeTax }}
                    accessibilityLabel={t('settings.pricesIncludeTax')}
                    onPress={() =>
                      updateSettings({ pricesIncludeTax: !settings.pricesIncludeTax })
                    }
                    className="min-h-12 flex-row items-center justify-between">
                    <Text className="flex-1 text-base text-ink">
                      {t('settings.pricesIncludeTax')}
                    </Text>
                    <Text className="ms-3 text-base font-semibold text-brand">
                      {settings.pricesIncludeTax ? t('settings.on') : t('settings.off')}
                    </Text>
                  </Pressable>
                  {settings.pricesIncludeTax ? (
                    <TextField
                      label={t('settings.taxRate')}
                      value={settings.taxPct}
                      onChangeText={(taxPct) => updateSettings({ taxPct })}
                      onBlur={() =>
                        updateSettings({
                          taxPct: formatDecimalInput(settings.taxPct, settings.locale),
                        })
                      }
                      keyboardType="decimal-pad"
                      suffix="%"
                    />
                  ) : null}
                </View>
              ) : null}
            </View>

            <View className="border-t border-line pt-2">
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded: isMoreOptionsOpen }}
                accessibilityLabel={t('settings.moreOptions')}
                onPress={() => setIsMoreOptionsOpen((open) => !open)}
                className="min-h-12 flex-row items-center justify-between">
                <Text className="text-base font-semibold text-ink">
                  {t('settings.moreOptions')}
                </Text>
                <Text className="text-sm font-semibold text-brand">
                  {isMoreOptionsOpen ? t('settings.closeSection') : t('settings.edit')}
                </Text>
              </Pressable>
              {isMoreOptionsOpen ? (
                <View className="gap-4 pb-2 pt-3">
                  <TextField
                    label={t('settings.cupSize')}
                    value={settings.cupMl}
                    onChangeText={(cupMl) => updateSettings({ cupMl })}
                    onBlur={() =>
                      updateSettings({
                        cupMl: formatDecimalInput(settings.cupMl, settings.locale),
                      })
                    }
                    keyboardType="decimal-pad"
                    suffix="ml"
                  />
                  <TextField
                    label={t('settings.tablespoonSize')}
                    value={settings.tablespoonMl}
                    onChangeText={(tablespoonMl) => updateSettings({ tablespoonMl })}
                    onBlur={() =>
                      updateSettings({
                        tablespoonMl: formatDecimalInput(
                          settings.tablespoonMl,
                          settings.locale,
                        ),
                      })
                    }
                    keyboardType="decimal-pad"
                    suffix="ml"
                  />
                  <View className="gap-2">
                    <Text className="text-base font-semibold text-ink">
                      {t('settings.suggestedPriceRounding')}
                    </Text>
                    <View className="flex-row flex-wrap gap-2">
                      {roundingRules.map((roundingRule) => (
                        <Pressable
                          accessibilityRole="button"
                          accessibilityState={{
                            selected: settings.roundingRule === roundingRule,
                          }}
                          accessibilityLabel={t(`settings.roundingRules.${roundingRule}`)}
                          onPress={() => updateSettings({ roundingRule })}
                          key={roundingRule}
                          className={`min-h-12 items-center justify-center rounded-xl border px-3 ${
                            settings.roundingRule === roundingRule
                              ? 'border-brand bg-surface'
                              : 'border-line bg-surface'
                          }`}>
                          <Text className="text-sm text-ink">
                            {t(`settings.roundingRules.${roundingRule}`)}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  </View>
                  <Pressable
                    accessibilityRole="switch"
                    accessibilityState={{ checked: settings.feesOnTaxIncludedPrice }}
                    accessibilityLabel={t('settings.feesOnTaxIncludedPrice')}
                    onPress={() =>
                      updateSettings({
                        feesOnTaxIncludedPrice: !settings.feesOnTaxIncludedPrice,
                      })
                    }
                    className="min-h-12 flex-row items-center justify-between">
                    <Text className="flex-1 text-base text-ink">
                      {t('settings.feesOnTaxIncludedPrice')}
                    </Text>
                    <Text className="ms-3 text-base font-semibold text-brand">
                      {settings.feesOnTaxIncludedPrice
                        ? t('settings.grossPrice')
                        : t('settings.netPrice')}
                    </Text>
                  </Pressable>
                </View>
              ) : null}
            </View>

            <View className="border-t border-line pt-4">
              <Text className="mb-2 text-base font-semibold text-ink">
                {t('settings.salesChannels')}
              </Text>
              <Text className="mb-2 text-sm text-muted">
                {t('settings.channelHelp')}
              </Text>
              {channels.map((channel) => (
                <ChannelSettingsRow
                  channel={channel}
                  locale={settings.locale}
                  expanded={expandedChannelId === channel.id}
                  onToggle={() =>
                    setExpandedChannelId((current) =>
                      current === channel.id ? undefined : channel.id,
                    )
                  }
                  onChange={(patch) => updateChannel(channel.id ?? '', patch)}
                  key={channel.id}
                />
              ))}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('settings.addChannel')}
                onPress={addChannel}
                className="mt-2 min-h-12 items-center justify-center rounded-xl border border-line bg-surface px-4">
                <Text className="text-base font-semibold text-ink">
                  {t('settings.addChannel')}
                </Text>
              </Pressable>
            </View>
            <View className="gap-3 border-t border-line pt-4">
              <View className="gap-1">
                <Text className="text-base font-semibold text-ink">
                  {t('settings.backup')}
                </Text>
                <Text className="text-sm leading-6 text-muted">
                  {t('settings.backupHelp')}
                </Text>
              </View>
              {backupError ? (
                <Text accessibilityRole="alert" className="text-sm text-bad">
                  {backupError}
                </Text>
              ) : null}
              {backupMessage ? (
                <Text accessibilityRole="summary" className="text-sm font-semibold text-good">
                  {backupMessage}
                </Text>
              ) : null}
              <Button
                label={t('settings.createBackup')}
                variant="secondary"
                onPress={() => void handleBackupExport()}
                disabled={!isReady || isBackupBusy}
              />
              <Button
                label={t('settings.mergeBackup')}
                variant="secondary"
                onPress={() => void handleBackupImport()}
                disabled={!isReady || isBackupBusy}
              />
            </View>
            <Text className="text-sm leading-6 text-muted">{t('settings.legalNote')}</Text>
          </ScrollView>

          <View
            className="border-t border-line bg-bg px-4 pt-3"
            style={{ paddingBottom: Math.max(12, insets.bottom) }}>
            <Button
              label={t('settings.save')}
              onPress={() => void handleSave()}
              disabled={!isReady || isSaving}
            />
          </View>
        </>
      ) : null}
    </SafeAreaView>
  );
}
