import React from 'react';
import {StyleSheet, View} from 'react-native';

import {useAuth} from '../auth/AuthContext';
import {useOperatingMode} from '../context/OperatingModeContext';
import {useT} from '../i18n';
import {AppText} from '../design-system';
import {useDesignSystem} from '../design-system/useDesignSystem';

export function OperatingModeChip({compact = false}: {compact?: boolean}) {
  const {mode, apiReachable, requiresPcApi} = useOperatingMode();
  const t = useT();
  const {session} = useAuth();
  const {colors, space, radius} = useDesignSystem();

  if (!session) {
    return null;
  }

  const showWarning = requiresPcApi && !apiReachable;

  return (
    <View
      style={[
        styles.chip,
        {
          backgroundColor: colors.surfaceMuted,
          borderColor: colors.border,
          borderRadius: radius.pill,
          paddingHorizontal: compact ? space[2] : space[3],
          paddingVertical: compact ? 4 : 6,
        },
      ]}>
      {showWarning ? (
        <View style={[styles.dot, {backgroundColor: colors.warning}]} />
      ) : null}
      <AppText variant="caption" color="textSecondary">
        {t(`modes.${mode}`)}
        {showWarning ? ` · ${t('sync.apiUnavailable')}` : ''}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderWidth: StyleSheet.hairlineWidth,
    gap: 6,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});
