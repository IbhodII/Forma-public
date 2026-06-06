import React from 'react';
import {ActivityIndicator, StyleSheet, Switch, View} from 'react-native';

import {useSyncSettings} from '../hooks/useSyncSettings';
import {AppText} from '../design-system/components/AppText';
import {useDesignSystem} from '../design-system/useDesignSystem';

type Props = {
  disabled?: boolean;
};

function ToggleRow({
  label,
  hint,
  value,
  onChange,
  disabled,
}: {
  label: string;
  hint?: string;
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  const {space} = useDesignSystem();
  return (
    <View style={{marginBottom: space[2]}}>
      <View style={styles.row}>
        <AppText variant="body" style={styles.label}>
          {label}
        </AppText>
        <Switch value={value} onValueChange={onChange} disabled={disabled} />
      </View>
      {hint ? (
        <AppText variant="caption" color="textMuted">
          {hint}
        </AppText>
      ) : null}
    </View>
  );
}

export function SyncSettingsToggles({disabled}: Props) {
  const {colors, space} = useDesignSystem();
  const {settings, isLoading, saveSettings, isSaving} = useSyncSettings();

  if (isLoading || !settings) {
    return <ActivityIndicator color={colors.accent} style={{marginVertical: space[2]}} />;
  }

  const busy = disabled || isSaving;

  return (
    <View>
      <ToggleRow
        label="Авто-синхронизация"
        hint="Фоновая и автоматическая синхронизация при изменениях"
        value={settings.autoEnabled && !settings.manualOnly}
        onChange={v => void saveSettings({autoEnabled: v, manualOnly: v ? false : settings.manualOnly})}
        disabled={busy || settings.manualOnly}
      />
      <ToggleRow
        label="Только вручную"
        hint="Отключает авто, фон и синхронизацию при переподключении"
        value={settings.manualOnly}
        onChange={v => void saveSettings({manualOnly: v, autoEnabled: v ? false : settings.autoEnabled})}
        disabled={busy}
      />
      <ToggleRow
        label="Только Wi‑Fi"
        hint="Не синхронизировать по мобильной сети"
        value={settings.wifiOnly}
        onChange={v => void saveSettings({wifiOnly: v})}
        disabled={busy}
      />
      <ToggleRow
        label="Только при зарядке"
        hint="Экономия батареи — синхронизация при подключении к питанию"
        value={settings.chargingOnly}
        onChange={v => void saveSettings({chargingOnly: v})}
        disabled={busy}
      />
      <ToggleRow
        label="Фоновая синхронизация (Android)"
        hint="Периодическая синхронизация в фоне (~4 ч)"
        value={settings.backgroundEnabled}
        onChange={v => void saveSettings({backgroundEnabled: v})}
        disabled={busy}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  label: {
    flex: 1,
  },
});
