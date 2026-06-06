import React from 'react';
import {StyleSheet, Text, View} from 'react-native';

import {AppButton} from '../../../design-system/components/AppButton';
import {useDesignSystem} from '../../../design-system/useDesignSystem';

type Props = {
  saving: boolean;
  error: string | null;
  onSave: () => void;
  onCancel: () => void;
};

export function WorkoutRecordFooter({saving, error, onSave, onCancel}: Props) {
  const {colors, typography, layout} = useDesignSystem();

  return (
    <View style={{gap: layout.stackGap}}>
      {error ? (
        <Text style={[typography.caption, {color: colors.danger}]}>{error}</Text>
      ) : null}
      <AppButton
        label={saving ? 'Сохранение…' : 'Сохранить тренировку'}
        onPress={onSave}
        disabled={saving}
        fullWidth
      />
      <AppButton label="Отмена" variant="secondary" onPress={onCancel} disabled={saving} fullWidth />
    </View>
  );
}

const styles = StyleSheet.create({});
