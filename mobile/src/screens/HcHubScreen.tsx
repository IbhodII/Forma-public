import React, {useCallback, useEffect, useState} from 'react';
import {ActivityIndicator, Linking, Platform, StyleSheet, Switch, View} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';

import {setupHealthConnect} from '../services/HealthConnectService';
import {
  getHcLastLocalReadAt,
  isHealthConnectModuleEnabled,
  setHealthConnectModuleEnabled,
} from '../services/hcModuleSettings';
import {runHealthConnectLocalRead} from '../services/healthConnectSync';
import {useOperatingMode} from '../context/OperatingModeContext';
import type {HcStackParamList} from '../navigation/HcStack';
import {
  AppButton,
  AppCard,
  AppScreen,
  AppText,
  CollapsibleSection,
  SectionHeader,
  StatusBadge,
} from '../design-system';
import {HcTrendsPanel} from '../components/hc/HcTrendsPanel';
import {HcAnalyticsMasterToggle} from '../components/HcAnalyticsMasterToggle';
import {useAnalyticsPeriod} from '../hooks/useAnalyticsPeriod';
import {useDeveloperMode} from '../hooks/useDeveloperMode';
import {useDesignSystem} from '../design-system/useDesignSystem';

type Nav = NativeStackNavigationProp<HcStackParamList, 'HcHub'>;

function formatAge(iso: string | null): string {
  if (!iso) {
    return 'нет данных';
  }
  const h = (Date.now() - new Date(iso).getTime()) / 3600000;
  if (h < 1) {
    return 'меньше часа назад';
  }
  if (h < 24) {
    return `${Math.round(h)} ч назад`;
  }
  return `${Math.round(h / 24)} дн назад`;
}

export default function HcHubScreen() {
  const {space} = useDesignSystem();
  const navigation = useNavigation<Nav>();
  const {developerMode} = useDeveloperMode();
  const {isLocalFirst} = useOperatingMode();
  const {period} = useAnalyticsPeriod(7);
  const trendDays = period <= 14 ? 7 : period <= 30 ? 14 : 30;
  const [enabled, setEnabled] = useState(false);
  const [lastRead, setLastRead] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [permissionsMissing, setPermissionsMissing] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      setEnabled(await isHealthConnectModuleEnabled());
      setLastRead(await getHcLastLocalReadAt());
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Не удалось загрузить настройки HC');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const toggleModule = async (v: boolean) => {
    await setHealthConnectModuleEnabled(v);
    setEnabled(v);
    if (v) {
      await setupHealthConnect();
    }
  };

  const syncNow = async () => {
    setBusy(true);
    try {
      const result = await runHealthConnectLocalRead();
      setPermissionsMissing(result.status === 'permissions');
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  if (Platform.OS !== 'android') {
    return (
      <AppScreen title="Health Connect" subtitle="Доступно только на Android">
        <AppText variant="body" color="textSecondary">
          На этой платформе Health Connect не поддерживается.
        </AppText>
      </AppScreen>
    );
  }

  return (
    <AppScreen title="Health Connect" subtitle="Шаги, сон, пульс и тренировки" scroll>
      <HcAnalyticsMasterToggle />
      <AppCard padding="lg" style={{gap: space[3], marginTop: space[3]}}>
        <View style={styles.row}>
          <AppText variant="title3">Сбор данных</AppText>
          <Switch value={enabled} onValueChange={v => void toggleModule(v)} />
        </View>
        {loading ? (
          <ActivityIndicator />
        ) : loadError ? (
          <AppText variant="body" color="danger">
            {loadError}
          </AppText>
        ) : (
          <>
            <AppText variant="body" color="textSecondary">
              Последнее чтение: {formatAge(lastRead)}
            </AppText>
            <View style={styles.badges}>
              <StatusBadge label="Health Connect" tone="accent" />
              {!enabled ? <StatusBadge label="Выключено" tone="warning" /> : null}
              {permissionsMissing ? (
                <StatusBadge label="Нет разрешений" tone="danger" />
              ) : null}
            </View>
            {permissionsMissing ? (
              <AppText variant="caption" color="danger">
                Разрешения Health Connect отозваны. Выдайте доступ в настройках.
              </AppText>
            ) : null}
          </>
        )}
      </AppCard>

      {enabled ? (
        <>
        <View style={{marginTop: space[3]}}>
          <HcTrendsPanel periodDays={trendDays} moduleEnabled={enabled} />
        </View>
        <AppCard padding="lg" style={{marginTop: space[3], gap: space[2]}}>
          <SectionHeader title="Сводка" />
          <AppText variant="body" color="textSecondary">
            Данные сохраняются на устройстве и участвуют в синхронизации Forma при включённом
            модуле.
          </AppText>
          <View style={{gap: space[2], marginTop: space[2]}}>
            <AppButton
              label={busy ? 'Чтение…' : 'Синхронизировать сейчас'}
              onPress={() => void syncNow()}
              loading={busy}
              fullWidth
            />
            <AppButton
              label="Разрешения Health Connect"
              variant="secondary"
              onPress={() => void setupHealthConnect().then(() => Linking.openSettings())}
              fullWidth
            />
          </View>
        </AppCard>
        </>
      ) : (
        <AppCard padding="lg" style={{marginTop: space[3]}}>
          <AppText variant="body" color="textSecondary">
            Включите сбор, чтобы читать шаги, сон и пульс из Health Connect.
          </AppText>
        </AppCard>
      )}

      {!isLocalFirst ? (
        <AppText variant="caption" color="textMuted" style={{marginTop: space[2]}}>
          В режиме legacy данные также могут отправляться на ПК — см. настройки интеграций.
        </AppText>
      ) : null}

      {developerMode ? (
        <View style={{marginTop: space[4]}}>
          <CollapsibleSection
            title="Расширенная диагностика"
            subtitle="Права, JSON, цепочка синхронизации">
            <AppButton
              label="Открыть диагностику"
              variant="secondary"
              onPress={() => navigation.navigate('HealthConnectDiagnostics')}
              fullWidth
            />
          </CollapsibleSection>
        </View>
      ) : null}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  badges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
});
