import React from 'react';
import {StyleSheet, View} from 'react-native';

import type {ApiEndpoints} from '../config/apiBaseStorage';
import {AppInput, AppText} from '../design-system';
import {useDesignSystem} from '../design-system/useDesignSystem';

type Props = {
  value: ApiEndpoints;
  onChange: (next: ApiEndpoints) => void;
};

export function ApiEndpointsForm({value, onChange}: Props) {
  const {space} = useDesignSystem();

  const field = (key: keyof ApiEndpoints, label: string, placeholder: string) => (
    <AppInput
      label={label}
      value={value[key]}
      onChangeText={text => onChange({...value, [key]: text})}
      placeholder={placeholder}
      autoCapitalize="none"
      autoCorrect={false}
      keyboardType="url"
    />
  );

  return (
    <View style={[styles.root, {gap: space[3]}]}>
      {field('local', 'Локальная сеть (Wi‑Fi)', 'http://192.168.1.10:8002')}
      {field('tailscale', 'Tailscale', 'http://100.x.x.x:8002')}
      <AppText variant="caption" color="textMuted">
        Оба адреса сохраняются. Приложение подключается к первому доступному (проверка
        параллельно).
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {width: '100%'},
});
