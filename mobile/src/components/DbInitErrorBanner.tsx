import React from 'react';
import {View} from 'react-native';

import {useOffline} from '../context/OfflineContext';
import {AppButton, AppText} from '../design-system';
import {useDesignSystem} from '../design-system/useDesignSystem';

export function DbInitErrorBanner() {
  const {dbInitError, retryDbInit} = useOffline();
  const {colors, layout, space} = useDesignSystem();

  if (!dbInitError) {
    return null;
  }

  return (
    <View
      style={{
        marginHorizontal: layout.screenPaddingX,
        marginBottom: space[2],
        padding: layout.cardPadding,
        backgroundColor: colors.dangerMuted,
        borderRadius: layout.cardPadding,
        gap: space[2],
      }}>
      <AppText variant="body" color="danger">
        Локальная база не открылась. Данные на устройстве недоступны.
      </AppText>
      <AppText variant="caption" color="textSecondary">
        {dbInitError}
      </AppText>
      <AppButton label="Повторить" variant="secondary" size="sm" onPress={() => void retryDbInit()} />
    </View>
  );
}
