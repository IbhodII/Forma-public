import React, {useEffect, useState} from 'react';
import {Linking, StyleSheet, View} from 'react-native';
import {useQuery} from '@tanstack/react-query';

import {fetchUserProfile} from '../api/user';
import {CycleSettingsPanel} from './CycleSettingsPanel';
import {OperatingModeChip} from './OperatingModeChip';
import {getApiBaseUrl, getConfiguredApiBaseUrl} from '../config/apiBase';
import {useAuth} from '../auth/AuthContext';
import {useOperatingMode} from '../context/OperatingModeContext';
import {getMeta, SCHEMA_VERSION} from '../database/index';
import {useDeveloperMode} from '../hooks/useDeveloperMode';
import {maskYandexUid} from '../mode/operatingMode';
import {getOrCreateDeviceId} from '../sync/deviceId';
import {AppButton, AppCard, AppText} from '../design-system';
import {loadOnboardingPreferences} from '../onboarding/storage';
import {isFemaleProfile} from '../utils/profileSex';

const appVersion: string = require('../../package.json').version || '0.0.0';

export function AboutSettings() {
  const profileQuery = useQuery({
    queryKey: ['user-profile'],
    queryFn: fetchUserProfile,
  });
  const onboardingPrefsQuery = useQuery({
    queryKey: ['onboarding-preferences'],
    queryFn: loadOnboardingPreferences,
    staleTime: Infinity,
  });
  const {session} = useAuth();
  const {modeLabel, requiresPcApi, apiReachable, dbReady} = useOperatingMode();
  const {developerMode, tryUnlockTap} = useDeveloperMode();
  const isFemale = isFemaleProfile(profileQuery.data, onboardingPrefsQuery.data?.sex);
  const [apiUrl, setApiUrl] = useState('');
  const [schemaVersion, setSchemaVersion] = useState<string>(String(SCHEMA_VERSION));
  const [deviceIdMasked, setDeviceIdMasked] = useState('');
  const envDefault = getConfiguredApiBaseUrl();

  useEffect(() => {
    void getApiBaseUrl().then(setApiUrl);
    void getMeta('schema_version').then(v => {
      if (v) {
        setSchemaVersion(v);
      }
    });
    void getOrCreateDeviceId().then(id => {
      if (id.length > 8) {
        setDeviceIdMasked(`${id.slice(0, 4)}…${id.slice(-4)}`);
      } else {
        setDeviceIdMasked('—');
      }
    });
  }, []);
  const openYandexMusic = () => {
    Linking.openURL('https://music.yandex.ru/artist/25591288').catch(err =>
      console.error('Ошибка открытия ссылки:', err),
    );
  };

  return (
    <AppCard padding="lg">
      <AppText variant="title2">О проекте</AppText>
      <AppText variant="body" onPress={() => void tryUnlockTap()}>
        Forma Mobile · v{appVersion}
        {developerMode ? ' · dev' : ''}
      </AppText>
      <View style={{marginTop: 8}}>
        <OperatingModeChip />
      </View>
      <AppText variant="caption" color="textSecondary" style={{marginTop: 8}}>
        Режим: {modeLabel}
        {requiresPcApi && !apiReachable ? ' · API недоступен' : ''}
        {dbReady ? ' · БД готова' : ' · БД не готова'}
        {` · схема ${schemaVersion}`}
      </AppText>
      {deviceIdMasked ? (
        <AppText variant="caption" color="textMuted">
          Устройство: {deviceIdMasked}
        </AppText>
      ) : null}
      {session?.yandexUid ? (
        <AppText variant="caption" color="textMuted">
          Yandex UID: {maskYandexUid(session.yandexUid)}
        </AppText>
      ) : null}
      {developerMode && apiUrl ? (
        <AppText variant="caption" color="textSecondary">
          API: {apiUrl}
        </AppText>
      ) : null}
      {developerMode && envDefault && envDefault !== apiUrl ? (
        <AppText variant="caption" color="textSecondary">
          .env: {envDefault}
        </AppText>
      ) : null}
      <AppText variant="body" color="textSecondary">
        Тренировки, питание, аналитика и синхронизация. Импорт FIT и Polar — на компьютере.
      </AppText>
      {isFemale ? <CycleSettingsPanel /> : null}
      <AppButton label="Яндекс.Музыка автора" variant="secondary" size="sm" onPress={openYandexMusic} />
      <View style={styles.row}>
        <AppButton
          label="Поддержать"
          variant="secondary"
          size="sm"
          onPress={() => Linking.openURL('https://tips.yandex.ru/guest/payment/3893596')}
        />
        <AppButton
          label="Контакты"
          variant="secondary"
          size="sm"
          onPress={() => Linking.openURL('https://github.com/ibhodi')}
        />
      </View>
    </AppCard>
  );
}

const styles = StyleSheet.create({
  row: {flexDirection: 'row', gap: 8, flexWrap: 'wrap'},
});
