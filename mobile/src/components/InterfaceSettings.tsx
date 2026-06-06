import React, {useEffect, useState} from 'react';
import {StyleSheet, Switch, Text, View} from 'react-native';

import {useAppTheme} from '../context/ThemeContext';
import {AppButton, AppChip, SettingsPanel} from '../design-system';
import {useDesignSystem} from '../design-system/useDesignSystem';
import {
  haptics,
  isHapticsEnabled,
  loadHapticsEnabled,
  saveHapticsEnabled,
  setHapticsEnabled,
} from '../haptics';
import {useOnboardingGate} from '../onboarding';

export function InterfaceSettings() {
  const {requestReplay} = useOnboardingGate();
  const {mode, setMode, resolvedTheme} = useAppTheme();
  const {colors, typography, space} = useDesignSystem();
  const [hapticsOn, setHapticsOn] = useState(isHapticsEnabled());

  useEffect(() => {
    void loadHapticsEnabled().then(v => {
      setHapticsOn(v);
      setHapticsEnabled(v);
    });
  }, []);

  return (
    <SettingsPanel title="Интерфейс">
      <View style={styles.rowBetween}>
        <View style={{flex: 1, paddingRight: space[2]}}>
          <Text style={[typography.body, {color: colors.text}]}>Тактильный отклик</Text>
          <Text style={[typography.caption, {color: colors.textMuted, marginTop: 2}]}>
            Лёгкая вибрация при действиях
          </Text>
        </View>
        <Switch
          value={hapticsOn}
          onValueChange={v => {
            haptics.toggle();
            setHapticsOn(v);
            setHapticsEnabled(v);
            void saveHapticsEnabled(v);
          }}
          trackColor={{false: colors.border, true: colors.accentMuted}}
          thumbColor={hapticsOn ? colors.accent : colors.surface}
        />
      </View>

      <Text style={[typography.caption, {color: colors.textMuted}]}>
        Тема: {resolvedTheme === 'dark' ? 'Тёмная' : 'Светлая'}
      </Text>
      <View style={styles.row}>
        {(['system', 'light', 'dark'] as const).map(t => (
          <AppChip
            key={t}
            label={t === 'system' ? 'Система' : t === 'light' ? 'Светлая' : 'Тёмная'}
            active={mode === t}
            variant="pill"
            onPress={() => setMode(t)}
          />
        ))}
      </View>

      <AppButton label="Пройти приветствие снова" variant="secondary" onPress={requestReplay} />
    </SettingsPanel>
  );
}

const styles = StyleSheet.create({
  rowBetween: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'},
  row: {flexDirection: 'row', flexWrap: 'wrap', gap: 8},
});
