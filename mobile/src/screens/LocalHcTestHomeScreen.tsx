import React, {useCallback, useEffect, useState} from 'react';
import {ScrollView, StyleSheet, View} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';

import {useAuth} from '../auth/AuthContext';
import {AppButton, AppScreen, AppText, SettingsPanel} from '../design-system';
import {useDesignSystem} from '../design-system/useDesignSystem';
import type {LocalHcTestStackParamList} from '../navigation/LocalHcTestStack';
import {getPermissionAudit, type PermissionAudit} from '../services/healthConnectAudit';
import {buildAndSaveLocalHcSnapshot} from '../services/healthConnectLocalSnapshot';
import {setupHealthConnect} from '../services/HealthConnectService';

export default function LocalHcTestHomeScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<LocalHcTestStackParamList>>();
  const {logout} = useAuth();
  const {colors} = useDesignSystem();
  const [permissions, setPermissions] = useState<PermissionAudit | null>(null);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState<'perm' | 'probe' | null>(null);

  const refreshPermissions = useCallback(async () => {
    try {
      setPermissions(await getPermissionAudit());
    } catch (e) {
      setStatus(e instanceof Error ? e.message : 'Ошибка проверки разрешений');
    }
  }, []);

  useEffect(() => {
    void refreshPermissions();
  }, [refreshPermissions]);

  const onRequestPermissions = async () => {
    setBusy('perm');
    setStatus('');
    try {
      const ok = await setupHealthConnect();
      setStatus(ok ? 'Разрешения Health Connect запрошены' : 'Health Connect недоступен');
      await refreshPermissions();
    } catch (e) {
      setStatus(e instanceof Error ? e.message : 'Ошибка запроса разрешений');
    } finally {
      setBusy(null);
    }
  };

  const onProbeLocally = async () => {
    setBusy('probe');
    setStatus('Читаем данные Health Connect…');
    try {
      const to = new Date();
      const from = new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000);
      await buildAndSaveLocalHcSnapshot(from, to);
      setStatus('Данные прочитаны и сохранены локально');
      navigation.navigate('HealthConnectDiagnostics');
    } catch (e) {
      setStatus(e instanceof Error ? e.message : 'Ошибка чтения HC');
    } finally {
      setBusy(null);
    }
  };

  return (
    <AppScreen
      title="Тест Health Connect"
      subtitle="Локальный режим — без API ПК"
      scroll={false}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <SettingsPanel title="Режим">
          <AppText variant="body" color="textSecondary">
            API недоступен или не требуется. Можно проверить, какие данные телефон отдаёт через
            Health Connect: шаги, вес, сон, калории, пульс, тренировки.
          </AppText>
        </SettingsPanel>

        <SettingsPanel title="Health Connect SDK">
          {permissions ? (
            <>
              <AppText variant="caption" color="textSecondary">
                SDK: {permissions.sdk_available ? 'доступен' : 'недоступен'} (
                {permissions.sdk_status})
              </AppText>
              {permissions.missing.length > 0 ? (
                <AppText variant="body" style={{color: colors.warning}}>
                  Не выданы: {permissions.missing.join(', ')}
                </AppText>
              ) : permissions.granted.length > 0 ? (
                <AppText variant="body">Разрешения выданы</AppText>
              ) : null}
            </>
          ) : (
            <AppText variant="caption">Загрузка…</AppText>
          )}
        </SettingsPanel>

        {status ? (
          <AppText variant="body" style={{color: colors.accent}}>
            {status}
          </AppText>
        ) : null}

        <View style={styles.actions}>
          <AppButton
            label="Запросить разрешения Health Connect"
            onPress={() => void onRequestPermissions()}
            loading={busy === 'perm'}
            disabled={busy != null}
            fullWidth
          />
          <AppButton
            label="Проверить Health Connect локально"
            variant="secondary"
            onPress={() => void onProbeLocally()}
            loading={busy === 'probe'}
            disabled={busy != null}
            fullWidth
          />
          <AppButton
            label="Открыть диагностику HC"
            variant="ghost"
            onPress={() => navigation.navigate('HealthConnectDiagnostics')}
            disabled={busy != null}
            fullWidth
          />
          <AppButton
            label="Выйти / Перейти к API-режиму"
            variant="ghost"
            onPress={() => void logout()}
            fullWidth
          />
        </View>
      </ScrollView>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  scroll: {paddingBottom: 32, gap: 12},
  actions: {gap: 10, marginTop: 8},
});
