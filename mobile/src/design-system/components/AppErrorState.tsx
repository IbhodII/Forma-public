import React from 'react';
import {StyleSheet, View, type StyleProp, type ViewStyle} from 'react-native';

import {AppButton} from './AppButton';
import {AppText} from './AppText';
import {useDesignSystem} from '../useDesignSystem';

type Props = {
  message?: string;
  onRetry?: () => void;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function AppErrorState({
  message = 'Не удалось загрузить данные',
  onRetry,
  compact,
  style,
}: Props) {
  const {colors, radius, space, layout} = useDesignSystem();

  return (
    <View
      style={[
        styles.wrap,
        compact ? styles.compact : {minHeight: layout.emptyMinHeight * 0.75},
        {backgroundColor: colors.dangerMuted, borderRadius: radius.md},
        style,
      ]}>
      <AppText variant="bodyMedium" color="danger" style={{textAlign: 'center'}}>
        {message}
      </AppText>
      {onRetry ? (
        <AppButton
          label="Повторить"
          onPress={onRetry}
          variant="danger"
          size="sm"
          style={{marginTop: space[3]}}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    padding: 16,
    alignItems: 'center',
  },
  compact: {padding: 12},
});
