import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {ActivityIndicator, Alert, Platform, ScrollView, StyleSheet, View} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import * as Clipboard from 'expo-clipboard';

import {useAuth} from '../auth/AuthContext';
import {getDebugSummary, getLatestSyncRun, type HcDebugSummary} from '../database/hcStore';
import {getHcBackgroundRunSummary, type HcBackgroundRunSummary} from '../services/hcCollectorSettings';
import {useOperatingMode} from '../context/OperatingModeContext';
import {useDeveloperMode} from '../hooks/useDeveloperMode';
import {AppButton, AppScreen, AppText, SettingsPanel} from '../design-system';
import {useDesignSystem} from '../design-system/useDesignSystem';
import {
  buildMobileAuditSnapshot,
  buildPreparedPayloadSummary,
  getPermissionAudit,
  probeRawDataTypes,
  type PermissionAudit,
  type PreparedPayloadSummary,
  type RawTypeProbe,
} from '../services/healthConnectAudit';
import {
  buildAndSaveLocalHcSnapshot,
  getLocalHcSnapshot,
  serializeLocalHcSnapshot,
  type LocalHcDebugSnapshot,
} from '../services/healthConnectLocalSnapshot';
import {
  getHcLastLocalReadAt,
  isHealthConnectModuleEnabled,
} from '../services/hcModuleSettings';
import {
  getLastSyncAudit,
  getLastHrImportTime,
  getLastSyncTime,
  runHealthConnectLocalRead,
  runHealthConnectSync,
  syncRangeLast24h,
  syncRangeLast7d,
  syncRangeToday,
  type HealthConnectSyncResponse,
} from '../services/healthConnectSync';
import {
  probeHeartRateSamples,
  type HeartRateProbeResult,
} from '../services/healthConnectAudit';
import {
  formatSyncChainStatus,
  getSyncDebugState,
  type HealthConnectSyncDebugState,
} from '../services/healthConnectSyncDebug';

type Props = Record<string, never>;

function formatDate(d: Date | null): string {
  if (!d) return '—';
  return d.toLocaleString('ru-RU');
}

function formatBytes(bytes: number | undefined): string {
  if (bytes == null) return '—';
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function RawProbeRow({probe}: {probe: RawTypeProbe}) {
  const {colors} = useDesignSystem();
  return (
    <View style={styles.probeRow}>
      <AppText variant="bodyBold">{probe.type}</AppText>
      <AppText variant="caption" color="textSecondary">
        {probe.record_type} · записей: {probe.count}
        {probe.date_min ? ` · ${probe.date_min} … ${probe.date_max}` : ''}
      </AppText>
      {probe.error ? (
        <AppText variant="caption" style={{color: colors.warning}}>
          {probe.unsupported ? 'unsupported' : 'error'}: {probe.error}
        </AppText>
      ) : null}
      {probe.samples.length > 0 ? (
        <AppText variant="caption" color="textMuted" numberOfLines={4}>
          {JSON.stringify(probe.samples[0])}
        </AppText>
      ) : null}
    </View>
  );
}

function SyncChainPanel({debug}: {debug: HealthConnectSyncDebugState | null}) {
  const {colors} = useDesignSystem();
  if (!debug) {
    return <AppText variant="caption" color="textSecondary">Нет данных — выполните синхронизацию</AppText>;
  }

  const bs = debug.backendSummary;
  const rawCounts = debug.rawRecordCounts ?? {};
  const rawLines = Object.entries(rawCounts).map(([type, count]) => `${type}: ${count}`);

  return (
    <>
      <AppText variant="caption" color="textSecondary">
        Фаза: {debug.phase}
      </AppText>
      <AppText variant="body">
        Permissions: {debug.permissionsGranted?.length ? 'выданы' : '—'}
        {debug.permissionsMissing?.length ? ` · не выданы: ${debug.permissionsMissing.join(', ')}` : ''}
      </AppText>
      {rawLines.length > 0 ? (
        <AppText variant="caption" color="textMuted">
          Raw: {rawLines.join(' · ')}
        </AppText>
      ) : null}
      <AppText variant="body">
        Prepared: {debug.preparedDaysCount ?? '—'} дн. · payload: {formatBytes(debug.payloadBytes)}
      </AppText>
      <AppText variant="caption" color="textSecondary">
        API base: {debug.apiBaseUrl ?? '—'}
      </AppText>
      <AppText variant="caption" color="textSecondary">
        POST URL: {debug.postUrlFull ?? '—'}
      </AppText>
      <AppText variant="body">
        X-User-ID: {debug.userIdPresent ? `да (${debug.userIdMasked})` : 'нет'}
      </AppText>
      <AppText variant="caption" color="textSecondary">
        Последняя попытка: {debug.lastAttemptAt ? formatDate(new Date(debug.lastAttemptAt)) : '—'}
      </AppText>
      <AppText variant="caption" color="textSecondary">
        HTTP: {debug.lastHttpStatus ?? '—'}
      </AppText>
      {debug.lastErrorText ? (
        <AppText variant="body" style={{color: colors.warning}}>
          Ошибка: {debug.lastErrorText}
        </AppText>
      ) : null}
      {bs ? (
        <>
          <AppText variant="bodyBold" style={styles.sectionGap}>
            Отправлено / принято / сохранено
          </AppText>
          <AppText variant="body">
            {formatSyncChainStatus(debug)}
          </AppText>
          {bs.sync_log_id != null ? (
            <AppText variant="caption" color="textSecondary">
              sync_log_id: {bs.sync_log_id}
            </AppText>
          ) : null}
          {(bs.warnings ?? []).length > 0 ? (
            <AppText variant="caption" style={{color: colors.warning}}>
              warnings: {(bs.warnings ?? []).join(', ')}
            </AppText>
          ) : null}
        </>
      ) : null}
      {debug.skipReason ? (
        <AppText variant="body" style={{color: colors.warning}}>
          Skip: {debug.skipReason}
        </AppText>
      ) : null}
      {debug.hrSamples != null ? (
        <>
          <AppText variant="bodyBold" style={styles.sectionGap}>
            Heart rate (continuous)
          </AppText>
          <AppText variant="caption" color="textSecondary">
            Permission HeartRate: {debug.hrPermissionGranted ? 'granted' : 'denied'}
          </AppText>
          <AppText variant="body">
            Records: {debug.hrRecords ?? '—'} · Samples: {debug.hrSamples ?? '—'}
          </AppText>
          <AppText variant="caption" color="textMuted">
            First: {debug.hrFirst ?? '—'} · Last: {debug.hrLast ?? '—'}
          </AppText>
          <AppText variant="caption" color="textMuted">
            Rejected: {debug.hrRejected ?? 0} · Duplicates: {debug.hrDuplicates ?? 0} · Source:{' '}
            {debug.hrImportSource ?? '—'}
          </AppText>
          <AppText variant="caption" color="textMuted">
            Sync duration: {debug.hrSyncDurationMs != null ? `${debug.hrSyncDurationMs} ms` : '—'} ·
            Watermark: {debug.hrWatermark ?? '—'}
          </AppText>
        </>
      ) : null}
    </>
  );
}

function LocalStorePanel({
  summary,
  bgSummary,
  lastBgRun,
}: {
  summary: HcDebugSummary | null;
  bgSummary: HcBackgroundRunSummary | null;
  lastBgRun: {status: string; started_at: string; records_by_type: Record<string, number>} | null;
}) {
  const {colors} = useDesignSystem();
  if (!summary) {
    return <AppText variant="caption" color="textSecondary">—</AppText>;
  }
  if (!summary.moduleEnabled) {
    return (
      <AppText variant="body" color="textSecondary">
        Health Connect выключен в настройках
      </AppText>
    );
  }

  const providerLines = Object.entries(summary.providers).filter(([, v]) => v);
  const recordLines = Object.entries(summary.recordsByType).map(([k, v]) => `${k}: ${v}`);

  return (
    <>
      <AppText variant="body">
        Модуль: {summary.moduleEnabled ? 'enabled' : 'disabled'}
      </AppText>
      <AppText variant="caption" color="textSecondary">
        Последнее локальное чтение: {summary.lastLocalReadAt ?? '—'}
      </AppText>
      <AppText variant="body">
        Дней в SQLite: {summary.dayCount}
        {summary.dateMin ? ` · ${summary.dateMin} … ${summary.dateMax}` : ''}
      </AppText>
      {recordLines.length > 0 ? (
        <AppText variant="caption" color="textMuted">
          Записи: {recordLines.join(' · ')}
        </AppText>
      ) : null}
      {providerLines.length > 0 ? (
        <AppText variant="caption" color="textMuted">
          Providers: {providerLines.map(([k, v]) => `${k}=${v}`).join(' · ')}
        </AppText>
      ) : null}
      {summary.staleProviders.length > 0 ? (
        <AppText variant="body" style={{color: colors.warning}}>
          Обновите данные в приложении-источнике: {summary.staleProviders.join(', ')}
        </AppText>
      ) : null}
      {summary.staleFields.length > 0 ? (
        <AppText variant="caption" style={{color: colors.warning}}>
          Stale: {summary.staleFields.join(', ')}
        </AppText>
      ) : null}
      {summary.manualSyncRequired ? (
        <AppText variant="body" style={{color: colors.warning}}>
          Требуется ручная синхронизация (разрешения или последний run с ошибкой)
        </AppText>
      ) : null}
      {bgSummary ? (
        <>
          <AppText variant="bodyBold" style={styles.sectionGap}>
            Background collector
          </AppText>
          <AppText variant="caption" color="textSecondary">
            {bgSummary.enabled ? 'enabled' : 'disabled'} · last: {bgSummary.lastRunAt ?? '—'}
          </AppText>
          <AppText variant="caption" color="textSecondary">
            next (est): {bgSummary.nextRunEstAt ?? '—'} · found/saved:{' '}
            {bgSummary.lastRecordsFound}/{bgSummary.lastRecordsSaved}
          </AppText>
          {bgSummary.lastError ? (
            <AppText variant="caption" style={{color: colors.warning}}>
              {bgSummary.lastError}
            </AppText>
          ) : null}
        </>
      ) : null}
      {lastBgRun ? (
        <AppText variant="caption" color="textMuted">
          Last background run: {lastBgRun.started_at} · {JSON.stringify(lastBgRun.records_by_type)}
        </AppText>
      ) : null}
      {summary.lastRun ? (
        <>
          <AppText variant="bodyBold" style={styles.sectionGap}>
            Последний run
          </AppText>
          <AppText variant="caption" color="textSecondary">
            {summary.lastRun.status} · {summary.lastRun.started_at}
            {summary.lastRun.finished_at ? ` → ${summary.lastRun.finished_at}` : ''}
          </AppText>
          <AppText variant="caption" color="textMuted">
            {JSON.stringify(summary.lastRun.records_by_type)}
          </AppText>
          {summary.lastRun.error_text ? (
            <AppText variant="caption" style={{color: colors.warning}}>
              {summary.lastRun.error_text}
            </AppText>
          ) : null}
        </>
      ) : null}
    </>
  );
}

export default function HealthConnectDiagnosticsScreen(_props: Props) {
  const navigation = useNavigation();
  const {isLocalHcTestMode} = useAuth();
  const {isLocalFirst} = useOperatingMode();
  const {developerMode} = useDeveloperMode();
  const {colors} = useDesignSystem();
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [status, setStatus] = useState('');
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [permissions, setPermissions] = useState<PermissionAudit | null>(null);
  const [rawProbes, setRawProbes] = useState<RawTypeProbe[]>([]);
  const [prepared, setPrepared] = useState<PreparedPayloadSummary | null>(null);
  const [lastResponse, setLastResponse] = useState<HealthConnectSyncResponse | null>(null);
  const [localSnapshot, setLocalSnapshot] = useState<LocalHcDebugSnapshot | null>(null);
  const [syncDebug, setSyncDebug] = useState<HealthConnectSyncDebugState | null>(null);
  const [hrProbe, setHrProbe] = useState<HeartRateProbeResult | null>(null);
  const [hrWatermark, setHrWatermark] = useState<Date | null>(null);
  const [moduleEnabled, setModuleEnabled] = useState(false);
  const [localStoreSummary, setLocalStoreSummary] = useState<HcDebugSummary | null>(null);
  const [bgSummary, setBgSummary] = useState<HcBackgroundRunSummary | null>(null);
  const [lastBgRun, setLastBgRun] = useState<{
    status: string;
    started_at: string;
    records_by_type: Record<string, number>;
  } | null>(null);

  const probeRange = useMemo(() => {
    const to = new Date();
    const from = new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000);
    return {from, to};
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setStatus('');
    try {
      const {from, to} = probeRange;
      const [perm, raw, prep, lastAudit, syncTime, saved, debug, hrImport, hrSampleProbe, enabled, localRead] =
        await Promise.all([
        getPermissionAudit(),
        probeRawDataTypes(from, to),
        buildPreparedPayloadSummary(from, to),
        isLocalHcTestMode ? Promise.resolve(null) : getLastSyncAudit(),
        isLocalHcTestMode ? Promise.resolve(null) : getLastSyncTime(),
        getLocalHcSnapshot(),
        isLocalHcTestMode ? Promise.resolve(null) : getSyncDebugState(),
        isLocalHcTestMode ? Promise.resolve(null) : getLastHrImportTime(),
        probeHeartRateSamples(from, to),
        isHealthConnectModuleEnabled(),
        getHcLastLocalReadAt(),
      ]);
      setPermissions(perm);
      setRawProbes(raw);
      setPrepared(prep);
      setLastResponse(lastAudit);
      setLastSync(syncTime);
      setLocalSnapshot(saved);
      setSyncDebug(debug);
      setHrWatermark(hrImport);
      setHrProbe(hrSampleProbe);
      setModuleEnabled(enabled);
      const bg = await getHcBackgroundRunSummary();
      setBgSummary(bg);
      const bgRun = await getLatestSyncRun('background');
      setLastBgRun(
        bgRun
          ? {
              status: bgRun.status,
              started_at: bgRun.started_at,
              records_by_type: JSON.parse(bgRun.records_by_type_json) as Record<string, number>,
            }
          : null,
      );
      setLocalStoreSummary(
        await getDebugSummary({
          moduleEnabled: enabled,
          lastLocalReadAt: localRead,
          permissionsMissing: (perm?.missing?.length ?? 0) > 0,
        }),
      );

      const snapshot = await buildAndSaveLocalHcSnapshot(
        from,
        to,
        isLocalHcTestMode ? 'local_hc_test' : 'api',
      );
      setLocalSnapshot(snapshot);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : 'Ошибка аудита');
    } finally {
      setLoading(false);
    }
  }, [isLocalHcTestMode, probeRange]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const onProbeLocal = async () => {
    setLoading(true);
    setStatus('Проверка Health Connect…');
    try {
      const {from, to} = probeRange;
      const snapshot = await buildAndSaveLocalHcSnapshot(
        from,
        to,
        isLocalHcTestMode ? 'local_hc_test' : 'api',
      );
      setLocalSnapshot(snapshot);
      await loadAll();
      setStatus('Локальная проверка завершена');
    } catch (e) {
      setStatus(e instanceof Error ? e.message : 'Ошибка проверки');
    } finally {
      setLoading(false);
    }
  };

  const onCopyJson = async () => {
    try {
      const {from, to} = probeRange;
      let payload = localSnapshot;
      if (!payload) {
        payload = await buildAndSaveLocalHcSnapshot(
          from,
          to,
          isLocalHcTestMode ? 'local_hc_test' : 'api',
        );
        setLocalSnapshot(payload);
      }
      const json = serializeLocalHcSnapshot(payload);
      await Clipboard.setStringAsync(json);
      Alert.alert('Скопировано', 'Debug JSON скопирован в буфер обмена');
    } catch (e) {
      Alert.alert('Ошибка', e instanceof Error ? e.message : 'Не удалось скопировать JSON');
    }
  };

  const onSyncWithRange = async (range: {from: Date; to: Date}, fullHrResync = false) => {
    if (isLocalHcTestMode) {
      setStatus('Синхронизация с API отключена в локальном режиме');
      return;
    }
    if (!moduleEnabled) {
      setStatus('Health Connect выключен в настройках');
      return;
    }
    setSyncing(true);
    setStatus(isLocalFirst ? 'Локальное чтение…' : 'Синхронизация…');
    try {
      const result = isLocalFirst
        ? await runHealthConnectLocalRead({...range, fullHrResync})
        : await runHealthConnectSync({...range, fullHrResync});
      const debug = await getSyncDebugState();
      setSyncDebug(debug);
      setStatus(formatSyncChainStatus(debug) || result.message);
      if (!isLocalFirst) {
        setLastResponse(await getLastSyncAudit());
        setLastSync(await getLastSyncTime());
        setHrWatermark(await getLastHrImportTime());
      }
      await loadAll();
    } catch (e) {
      const debug = await getSyncDebugState();
      setSyncDebug(debug);
      setStatus(formatSyncChainStatus(debug) || (e instanceof Error ? e.message : 'Ошибка синхронизации'));
    } finally {
      setSyncing(false);
    }
  };

  const onSync = async () => onSyncWithRange({from: probeRange.from, to: probeRange.to});

  const subtitle = isLocalHcTestMode
    ? 'Локальный режим — raw → prepared (без backend)'
    : moduleEnabled
      ? isLocalFirst
        ? 'Raw → prepared → SQLite (локальный модуль)'
        : 'Raw → prepared → SQLite → backend (Legacy API)'
      : 'Health Connect выключен в настройках';

  if (!developerMode && !isLocalHcTestMode) {
    return (
      <AppScreen title="HC диагностика" subtitle="Режим разработчика">
        <AppText variant="body" color="textSecondary">
          Расширенная диагностика доступна после включения режима разработчика (7 нажатий на версию в
          «О проекте»).
        </AppText>
        <AppButton label="← Назад" variant="secondary" size="sm" onPress={() => navigation.goBack()} />
      </AppScreen>
    );
  }

  if (Platform.OS !== 'android') {
    return (
      <AppScreen title="HC диагностика" subtitle="Только Android">
        <AppText variant="body">Health Connect доступен только на Android.</AppText>
      </AppScreen>
    );
  }

  return (
    <AppScreen title="HC диагностика" subtitle={subtitle} scroll={false}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <AppButton label="← Назад" variant="secondary" size="sm" onPress={() => navigation.goBack()} />
        {isLocalHcTestMode ? (
          <AppText variant="caption" color="textSecondary">
            Синхронизация с API отключена в локальном режиме.
          </AppText>
        ) : null}
        <View style={styles.actions}>
          <AppButton
            label="Проверить Health Connect локально"
            size="sm"
            onPress={() => void onProbeLocal()}
            disabled={loading}
          />
          <AppButton
            label="Обновить аудит"
            size="sm"
            variant="secondary"
            onPress={() => void loadAll()}
            disabled={loading}
          />
          <AppButton
            label="Скопировать debug JSON"
            size="sm"
            variant="secondary"
            onPress={() => void onCopyJson()}
          />
          {!isLocalHcTestMode && moduleEnabled ? (
            <>
              <AppButton
                label={isLocalFirst ? 'Синхронизировать локально' : 'Отправить Health Connect на ПК'}
                size="sm"
                onPress={() => void onSync()}
                loading={syncing}
                disabled={syncing}
              />
              {!isLocalFirst ? (
                <>
                  <AppButton
                    label="Sync HR: today"
                    size="sm"
                    variant="secondary"
                    onPress={() => void onSyncWithRange(syncRangeToday())}
                    disabled={syncing}
                  />
                  <AppButton
                    label="Sync HR: 24h"
                    size="sm"
                    variant="secondary"
                    onPress={() => void onSyncWithRange(syncRangeLast24h())}
                    disabled={syncing}
                  />
                  <AppButton
                    label="Sync HR: 7d"
                    size="sm"
                    variant="secondary"
                    onPress={() => void onSyncWithRange(syncRangeLast7d())}
                    disabled={syncing}
                  />
                  <AppButton
                    label="Full HR resync (7d)"
                    size="sm"
                    variant="secondary"
                    onPress={() => void onSyncWithRange(syncRangeLast7d(), true)}
                    disabled={syncing}
                  />
                </>
              ) : null}
            </>
          ) : null}
        </View>
        {loading ? <ActivityIndicator color={colors.accent} /> : null}
        {status ? (
          <AppText variant="body" style={{color: colors.accent}}>
            {status}
          </AppText>
        ) : null}
        {!isLocalHcTestMode ? (
          <AppText variant="caption" color="textSecondary">
            Последняя синхронизация: {formatDate(lastSync)}
          </AppText>
        ) : null}
        {localSnapshot?.saved_at ? (
          <AppText variant="caption" color="textSecondary">
            Локальный snapshot: {formatDate(new Date(localSnapshot.saved_at))}
          </AppText>
        ) : null}

        {!isLocalHcTestMode ? (
          <SettingsPanel title="0. Sync chain">
            <SyncChainPanel debug={syncDebug} />
          </SettingsPanel>
        ) : null}

        <SettingsPanel title="Local store">
          <LocalStorePanel summary={localStoreSummary} bgSummary={bgSummary} lastBgRun={lastBgRun} />
        </SettingsPanel>

        <SettingsPanel title="1. Permissions">
          {permissions ? (
            <>
              <AppText variant="caption" color="textSecondary">
                SDK: {permissions.sdk_available ? 'доступен' : 'недоступен'} ({permissions.sdk_status})
              </AppText>
              <AppText variant="body">Выданы: {permissions.granted.join(', ') || '—'}</AppText>
              <AppText variant="body">
                HeartRate:{' '}
                {permissions.permissions.HeartRate === true
                  ? 'granted'
                  : permissions.permissions.HeartRate === false
                    ? 'denied'
                    : '—'}
              </AppText>
              {permissions.missing.length > 0 ? (
                <AppText variant="body" style={{color: colors.warning}}>
                  Не выданы: {permissions.missing.join(', ')}
                </AppText>
              ) : null}
            </>
          ) : (
            <AppText variant="caption">—</AppText>
          )}
        </SettingsPanel>

        <SettingsPanel title="2. Heart rate probe (7 дн.)">
          {hrProbe ? (
            <>
              <AppText variant="body">
                Records: {hrProbe.record_count} · Samples: {hrProbe.sample_count}
              </AppText>
              <AppText variant="caption" color="textSecondary">
                Permission: {hrProbe.permission_granted ? 'granted' : 'denied'} · Source:{' '}
                {hrProbe.import_source}
              </AppText>
              <AppText variant="caption" color="textMuted">
                First: {hrProbe.first_sample ?? '—'} · Last: {hrProbe.last_sample ?? '—'}
              </AppText>
              <AppText variant="caption" color="textMuted">
                Rejected: {hrProbe.rejected} · Duplicates: {hrProbe.duplicates}
              </AppText>
              <AppText variant="caption" color="textSecondary">
                HR watermark: {formatDate(hrWatermark)}
              </AppText>
            </>
          ) : (
            <AppText variant="caption">—</AppText>
          )}
        </SettingsPanel>

        <SettingsPanel title="3. Raw on phone (7 дн.)">
          {rawProbes.map(p => (
            <RawProbeRow key={p.type} probe={p} />
          ))}
        </SettingsPanel>

        <SettingsPanel title="4. Prepared payload">
          {prepared ? (
            <>
              <AppText variant="body">
                Дней: {prepared.day_count} · шаги: {prepared.days_with_steps} · калории:{' '}
                {prepared.days_with_calories} · вес: {prepared.days_with_weight} · сон:{' '}
                {prepared.days_with_sleep} · HR дней: {prepared.days_with_heart_rate} · HR
                samples: {prepared.total_heart_rate_samples} · тренировок:{' '}
                {prepared.total_workouts}
              </AppText>
              {prepared.preview_days.map(day => (
                <AppText key={day.date} variant="caption" color="textMuted" numberOfLines={3}>
                  {day.date}: {JSON.stringify(Object.keys(day).filter(k => k !== 'date'))}
                </AppText>
              ))}
            </>
          ) : null}
        </SettingsPanel>

        {!isLocalHcTestMode ? (
          <SettingsPanel title="5–7. Last backend response">
            {lastResponse?.audit ? (
              <>
                <AppText variant="bodyBold">Received</AppText>
                <AppText variant="caption" color="textMuted">
                  {JSON.stringify(lastResponse.audit.received_totals ?? {})}
                </AppText>
                <AppText variant="bodyBold" style={styles.sectionGap}>
                  Saved
                </AppText>
                <AppText variant="caption" color="textMuted">
                  {JSON.stringify(lastResponse.audit.saved_totals ?? lastResponse.saved ?? {})}
                </AppText>
                <AppText variant="bodyBold" style={styles.sectionGap}>
                  Skipped
                </AppText>
                <AppText variant="caption" color="textMuted">
                  {JSON.stringify(lastResponse.audit.skipped_totals ?? lastResponse.skipped ?? {})}
                </AppText>
                {(lastResponse.audit.warnings ?? lastResponse.warnings ?? []).length > 0 ? (
                  <AppText variant="caption" style={{color: colors.warning}}>
                    warnings: {(lastResponse.audit.warnings ?? lastResponse.warnings ?? []).join(', ')}
                  </AppText>
                ) : null}
                {lastResponse.sync_log_id != null ? (
                  <AppText variant="caption" color="textSecondary">
                    sync_log_id: {lastResponse.sync_log_id}
                  </AppText>
                ) : null}
              </>
            ) : (
              <AppText variant="caption" color="textSecondary">
                Нет данных — выполните синхронизацию
              </AppText>
            )}
          </SettingsPanel>
        ) : null}
      </ScrollView>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  scroll: {paddingBottom: 32, gap: 12},
  actions: {flexDirection: 'row', flexWrap: 'wrap', gap: 8},
  probeRow: {marginBottom: 10, gap: 2},
  sectionGap: {marginTop: 8},
});
