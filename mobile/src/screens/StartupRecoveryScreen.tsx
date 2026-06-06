import React, {useState} from 'react';
import {Share, StyleSheet, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';

import {useAuth} from '../auth/AuthContext';
import {AppButton} from '../design-system/components/AppButton';
import {AppText} from '../design-system/components/AppText';
import {getStartupLogText, logStartup} from '../debug/startupLog';
import {completeOnboarding, resetOnboarding} from '../onboarding/storage';
import {draftToPreferences} from '../onboarding/persist';
import {EMPTY_DRAFT} from '../onboarding/types';
import {useDesignSystem} from '../design-system/useDesignSystem';
import {useT} from '../i18n';

type Props = {
  reason?: string;
  onContinueLocal: () => void;
  onSessionReset: () => void;
};

export default function StartupRecoveryScreen({
  reason,
  onContinueLocal,
  onSessionReset,
}: Props) {
  const t = useT();
  const insets = useSafeAreaInsets();
  const {colors, space} = useDesignSystem();
  const {loginAutonomousLocal, logout} = useAuth();
  const [busy, setBusy] = useState<'continue' | 'reset' | 'export' | null>(null);

  const continueLocal = async () => {
    setBusy('continue');
    try {
      logStartup('recovery', 'continue_local tapped');
      await loginAutonomousLocal('autonomous');
      await completeOnboarding(draftToPreferences(EMPTY_DRAFT));
      onContinueLocal();
    } finally {
      setBusy(null);
    }
  };

  const resetSession = async () => {
    setBusy('reset');
    try {
      logStartup('recovery', 'reset_session tapped');
      await logout();
      await resetOnboarding();
      onSessionReset();
    } finally {
      setBusy(null);
    }
  };

  const exportLogs = async () => {
    setBusy('export');
    try {
      const body = getStartupLogText() || '(no startup logs yet)';
      await Share.share({
        message: body,
        title: 'Forma startup logs',
      });
    } finally {
      setBusy(null);
    }
  };

  return (
    <View
      style={[
        styles.root,
        {
          backgroundColor: colors.bg,
          paddingTop: insets.top + space[6],
          paddingBottom: insets.bottom + space[4],
          paddingHorizontal: space[4],
        },
      ]}>
      <AppText variant="title2">{t('recovery.title')}</AppText>
      <AppText variant="body" color="textMuted" style={{marginTop: space[2]}}>
        {reason ?? t('recovery.defaultReason')}
      </AppText>
      <View style={{marginTop: space[5], gap: space[2]}}>
        <AppButton
          label={t('recovery.continueLocal')}
          onPress={() => void continueLocal()}
          loading={busy === 'continue'}
          disabled={busy != null && busy !== 'continue'}
          fullWidth
        />
        <AppButton
          label={t('recovery.resetSession')}
          variant="secondary"
          onPress={() => void resetSession()}
          loading={busy === 'reset'}
          disabled={busy != null && busy !== 'reset'}
          fullWidth
        />
        <AppButton
          label={t('recovery.exportLogs')}
          variant="secondary"
          onPress={() => void exportLogs()}
          loading={busy === 'export'}
          disabled={busy != null && busy !== 'export'}
          fullWidth
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'center',
  },
});
