import React, {useCallback, useEffect, useState} from 'react';
import {StyleSheet, View} from 'react-native';

import {listUnresolvedConflicts, type SyncConflictRow} from '../database/conflictStore';
import {applyConflictChoice} from '../sync/conflictResolution';
import {manualSyncNow} from '../sync/syncOrchestrator';
import {AppButton, AppCard, AppSheet, AppText} from '../design-system';
import {useDesignSystem} from '../design-system/useDesignSystem';

type Props = {
  visible: boolean;
  onClose: () => void;
};

export function ConflictCenterModal({visible, onClose}: Props) {
  const {layout} = useDesignSystem();
  const [rows, setRows] = useState<SyncConflictRow[]>([]);
  const [actionError, setActionError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setRows(await listUnresolvedConflicts());
  }, []);

  useEffect(() => {
    if (visible) {
      void reload();
    }
  }, [visible, reload]);

  const pickVersion = async (row: SyncConflictRow, choice: 'local' | 'server') => {
    setActionError(null);
    try {
      await applyConflictChoice(row, choice);
      if (choice === 'local') {
        const syncResult = await manualSyncNow();
        if (!syncResult.ok) {
          setActionError(syncResult.message ?? 'Не удалось отправить локальную версию');
        }
      }
      await reload();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Не удалось применить выбор');
    }
  };

  return (
    <AppSheet visible={visible} title="Конфликты синхронизации" onClose={onClose} scroll>
      {actionError ? (
        <AppText variant="caption" color="danger" style={styles.empty}>
          {actionError}
        </AppText>
      ) : null}
      {rows.length === 0 ? (
        <AppText variant="body" color="textMuted" style={styles.empty}>
          Нет нерешённых конфликтов
        </AppText>
      ) : (
        rows.map(row => (
          <AppCard key={row.id} padding="md" style={{marginBottom: layout.blockGapCompact}}>
            <AppText variant="title3">{row.entity_label}</AppText>
            <AppText variant="caption" color="textMuted" style={styles.sub}>
              {row.entity_type}
              {row.winner ? ` · применена: ${row.winner === 'remote' ? 'удалённая' : 'локальная'}` : ''}
            </AppText>
            <View style={styles.row}>
              <AppButton
                label="Оставить локальную"
                variant="secondary"
                size="sm"
                onPress={() => void pickVersion(row, 'local')}
              />
              <AppButton
                label="Принять серверную"
                variant="secondary"
                size="sm"
                onPress={() => void pickVersion(row, 'server')}
              />
            </View>
          </AppCard>
        ))
      )}
      <AppText variant="caption" color="textMuted" style={styles.hint}>
        При равных метках времени побеждает более новая версия (updated_at). Предыдущая локальная
        копия сохранена в журнале конфликтов. Можно закрыть и разобрать позже.
      </AppText>
      <AppButton label="Разобрать позже" variant="ghost" onPress={onClose} style={styles.close} />
    </AppSheet>
  );
}

const styles = StyleSheet.create({
  empty: {textAlign: 'center', marginTop: 24},
  sub: {marginTop: 4},
  row: {flexDirection: 'row', gap: 8, marginTop: 8, flexWrap: 'wrap'},
  close: {marginTop: 12},
  hint: {marginTop: 16, lineHeight: 18},
});
