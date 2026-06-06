import React, {useCallback, useEffect, useState} from 'react';
import {ScrollView, StyleSheet, View} from 'react-native';
import Animated from 'react-native-reanimated';
import {useSafeAreaInsets} from 'react-native-safe-area-context';

import {ApiEndpointsForm} from '../components/ApiEndpointsForm';
import {pingFirstAvailable} from '../api/ping';
import {
  getApiBaseUrl,
  getApiBaseUrlHint,
  getConfiguredApiEndpoints,
  getMergedApiEndpoints,
} from '../config/apiBase';
import {invalidateApiBaseCache} from '../config/apiBaseResolver';
import {getStoredApiEndpoints, setStoredApiEndpoints} from '../config/apiBaseStorage';
import type {ApiEndpoints} from '../config/apiBaseStorage';
import {isNativeCloudConfigured} from '../config/cloudOAuth';
import {useAuth} from '../auth/AuthContext';
import {AppButton} from '../design-system/components/AppButton';
import {AppText} from '../design-system/components/AppText';
import {enterFadeDown} from '../design-system/motion/entering';
import {useDesignSystem} from '../design-system/useDesignSystem';
import {useT} from '../i18n';
import {useClientCapabilities} from '../hooks/useClientCapabilities';
import {formatUserFacingError, missingYandexClientIdHelp} from '../utils/userFacingError';

const EMPTY: ApiEndpoints = {local: '', tailscale: ''};

export default function LoginScreen() {
  const t = useT();
  const insets = useSafeAreaInsets();
  const {colors, space} = useDesignSystem();
  const caps = useClientCapabilities();
  const legacyAllowed = caps.enableLegacyApiMode || __DEV__;
  const {
    openCloudLogin,
    loginLocalAdmin,
    loginLocalHcTest,
    loginAutonomousYandex,
    loginAutonomousLocal,
  } = useAuth();

  const [draft, setDraft] = useState<ApiEndpoints>(EMPTY);
  const [apiBase, setApiBase] = useState('');
  const configHint = getApiBaseUrlHint(apiBase || draft.local || draft.tailscale);
  const yandexNativeReady = isNativeCloudConfigured('yandex');

  const [pingOk, setPingOk] = useState<boolean | null>(null);
  const [checking, setChecking] = useState(false);
  const [pingError, setPingError] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<
    | 'localAuto'
    | 'yandexAuto'
    | 'yandexCloud'
    | 'yandex'
    | 'google'
    | 'admin'
    | 'save'
    | 'localHc'
    | null
  >(null);
  const [showLegacy, setShowLegacy] = useState(false);

  const loadApiUrl = useCallback(async () => {
    const stored = await getStoredApiEndpoints();
    const merged = await getMergedApiEndpoints();
    setDraft(stored.local || stored.tailscale ? stored : merged);
    setApiBase(await getApiBaseUrl());
  }, []);

  const checkApi = useCallback(async (endpoints: ApiEndpoints) => {
    setChecking(true);
    setPingError('');
    const ep = endpoints;
    const bases = [ep.local, ep.tailscale].filter(Boolean);
    if (bases.length === 0) {
      const active = await getApiBaseUrl();
      setApiBase(active);
      setPingOk(active ? null : false);
      if (!active) {
        setPingError(getApiBaseUrlHint('') ?? t('auth.needPcUrl'));
      }
      setChecking(false);
      return;
    }
    invalidateApiBaseCache();
    const result = await pingFirstAvailable(bases);
    setApiBase(result.ok ? result.base : bases[0]!);
    setPingOk(result.ok);
    if (!result.ok) {
      setPingError(result.error);
    }
    setChecking(false);
  }, []);

  useEffect(() => {
    void loadApiUrl();
  }, [loadApiUrl]);

  const saveAndCheck = async () => {
    setError('');
    setBusy('save');
    try {
      invalidateApiBaseCache();
      await setStoredApiEndpoints(draft);
      await loadApiUrl();
      await checkApi(draft);
    } catch (e) {
      setError(formatUserFacingError(e));
    } finally {
      setBusy(null);
    }
  };

  const ensureReachable = async () => {
    if (draft.local.trim() || draft.tailscale.trim()) {
      invalidateApiBaseCache();
      await setStoredApiEndpoints(draft);
      await loadApiUrl();
    }
    const bases = [draft.local, draft.tailscale].filter(Boolean);
    const ping = await pingFirstAvailable(
      bases.length ? bases : [await getApiBaseUrl()],
    );
    if (!ping.ok) {
      throw new Error(ping.error || 'API недоступен');
    }
    invalidateApiBaseCache();
    return ping.base;
  };

  const runAdminLogin = async () => {
    setError('');
    setBusy('admin');
    try {
      await ensureReachable();
      await loginLocalAdmin();
    } catch (e) {
      setError(formatUserFacingError(e));
    } finally {
      setBusy(null);
    }
  };

  const runLocalHcTest = async () => {
    setError('');
    setBusy('localHc');
    try {
      await loginLocalHcTest();
    } catch (e) {
      setError(formatUserFacingError(e));
    } finally {
      setBusy(null);
    }
  };

  const runAutonomousLocal = async () => {
    setError('');
    setBusy('localAuto');
    try {
      await loginAutonomousLocal('autonomous');
    } catch (e) {
      setError(formatUserFacingError(e));
    } finally {
      setBusy(null);
    }
  };

  const runAutonomousYandex = async (mode: 'autonomous' | 'cloud') => {
    setError('');
    setBusy(mode === 'autonomous' ? 'yandexAuto' : 'yandexCloud');
    try {
      await loginAutonomousYandex(mode);
    } catch (e) {
      setError(formatUserFacingError(e));
    } finally {
      setBusy(null);
    }
  };

  const runOAuth = async (provider: 'yandex' | 'google') => {
    setError('');
    setBusy(provider);
    try {
      await ensureReachable();
      await openCloudLogin(provider);
    } catch (e) {
      setError(formatUserFacingError(e));
    } finally {
      setBusy(null);
    }
  };

  const hasEndpoints =
    Boolean(draft.local.trim() || draft.tailscale.trim()) ||
    Boolean(getConfiguredApiEndpoints().local || getConfiguredApiEndpoints().tailscale) ||
    Boolean(apiBase);

  return (
    <View style={[styles.root, {backgroundColor: colors.bg}]}>
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          {
            paddingTop: insets.top + space[6],
            paddingBottom: insets.bottom + space[6],
            paddingHorizontal: space[4],
          },
        ]}
        keyboardShouldPersistTaps="handled">
        <Animated.View entering={enterFadeDown(0)} style={[styles.brand, {gap: space[2]}]}>
          <AppText variant="title2">{t('common.appName')}</AppText>
          <AppText variant="body" color="textMuted">
            {t('auth.subtitle')}
          </AppText>
        </Animated.View>

        <Animated.View entering={enterFadeDown(1)} style={{gap: space[2], marginTop: space[5]}}>
          <AppButton
            label={t('auth.continueLocal')}
            onPress={() => void runAutonomousLocal()}
            loading={busy === 'localAuto'}
            disabled={busy != null && busy !== 'localAuto'}
            fullWidth
          />
          <AppText variant="caption" color="textMuted" style={styles.hint}>
            {t('auth.continueLocalHint')}
          </AppText>
          <AppButton
            label={t('auth.yandexAutonomous')}
            onPress={() => void runAutonomousYandex('autonomous')}
            loading={busy === 'yandexAuto'}
            disabled={!yandexNativeReady || (busy != null && busy !== 'yandexAuto')}
            fullWidth
          />
          {!yandexNativeReady ? (
            <AppText variant="caption" color="warning">
              {missingYandexClientIdHelp()}
            </AppText>
          ) : null}
          <AppButton
            label={t('auth.yandexCloud')}
            variant="secondary"
            onPress={() => void runAutonomousYandex('cloud')}
            loading={busy === 'yandexCloud'}
            disabled={!yandexNativeReady || (busy != null && busy !== 'yandexCloud')}
            fullWidth
          />
        </Animated.View>

        {error ? (
          <AppText variant="body" color="danger" style={styles.banner}>
            {error}
          </AppText>
        ) : null}

        {legacyAllowed ? (
          <Animated.View entering={enterFadeDown(2)} style={{marginTop: space[5], gap: space[2]}}>
            <AppButton
              label={showLegacy ? t('auth.hidePcSync') : t('auth.showPcSync')}
              variant="ghost"
              onPress={() => setShowLegacy(v => !v)}
              fullWidth
            />
          </Animated.View>
        ) : null}

        {legacyAllowed && showLegacy ? (
          <Animated.View entering={enterFadeDown(3)} style={{marginTop: space[3], gap: space[3]}}>
            <ApiEndpointsForm value={draft} onChange={setDraft} />
            <AppButton
              label={t('auth.saveAndCheckConnection')}
              variant="secondary"
              onPress={() => void saveAndCheck()}
              loading={busy === 'save'}
              disabled={(!draft.local.trim() && !draft.tailscale.trim()) || busy != null}
              fullWidth
            />

            {apiBase ? (
              <AppText variant="caption" color="textMuted">
                {t('auth.activeServer', {url: apiBase})}
              </AppText>
            ) : null}

            {configHint ? (
              <AppText variant="body" color="textSecondary" style={styles.banner}>
                {configHint}
              </AppText>
            ) : null}

            {checking ? (
              <AppText variant="caption" color="textMuted" style={styles.hint}>
                {t('auth.checkingConnection')}
              </AppText>
            ) : null}

            {!checking && pingOk === false && pingError ? (
              <AppText variant="body" color="textSecondary" style={styles.banner}>
                {t('auth.connectionFailed', {error: pingError})}
              </AppText>
            ) : null}

            {!checking && pingOk === true ? (
              <AppText variant="caption" color="textMuted" style={styles.hint}>
                {t('auth.connectionOk')}
              </AppText>
            ) : null}

            {!checking ? (
              <AppButton
                label={t('auth.retryConnection')}
                variant="ghost"
                onPress={() => void checkApi(draft)}
              />
            ) : null}

            <AppButton
              label={t('auth.loginAdmin')}
              onPress={() => void runAdminLogin()}
              loading={busy === 'admin'}
              disabled={!hasEndpoints || busy != null}
              fullWidth
            />
            <AppButton
              label={t('auth.loginYandexServer')}
              variant="secondary"
              onPress={() => void runOAuth('yandex')}
              loading={busy === 'yandex'}
              disabled={!hasEndpoints || busy != null}
              fullWidth
            />
            <AppButton
              label={t('auth.loginGoogleServer')}
              variant="secondary"
              onPress={() => void runOAuth('google')}
              loading={busy === 'google'}
              disabled={!hasEndpoints || busy != null}
              fullWidth
            />
          </Animated.View>
        ) : null}

        {__DEV__ ? (
          <Animated.View
            entering={enterFadeDown(4)}
            style={{gap: space[2], marginTop: space[5]}}>
            <AppButton
              label={t('auth.hcTestLogin')}
              variant="secondary"
              onPress={() => void runLocalHcTest()}
              loading={busy === 'localHc'}
              disabled={busy != null && busy !== 'localHc'}
              fullWidth
            />
            <AppText variant="caption" color="textMuted" style={styles.hint}>
              {t('auth.hcTestHint')}
            </AppText>
          </Animated.View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1},
  scroll: {flexGrow: 1, justifyContent: 'center'},
  brand: {marginBottom: 8},
  banner: {marginTop: 12, textAlign: 'center', lineHeight: 22},
  hint: {textAlign: 'center', marginTop: 8},
});
