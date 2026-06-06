import React, {useState} from 'react';
import {Alert, StyleSheet, View} from 'react-native';

import {createLocalBackupZip, importLocalBackupZip, shareBackup} from '../services/backup';
import {AppButton, AppText, SettingsPanel} from '../design-system';

export function BackupSettings() {
  const [busy, setBusy] = useState(false);
  const [lastPath, setLastPath] = useState<string>('');

  const onExport = async () => {
    setBusy(true);
    try {
      const zipPath = await createLocalBackupZip();
      setLastPath(zipPath);
      await shareBackup(zipPath);
      Alert.alert('Бэкап', 'ZIP-архив создан и готов к отправке');
    } catch (e) {
      Alert.alert('Ошибка экспорта', e instanceof Error ? e.message : 'Не удалось создать бэкап');
    } finally {
      setBusy(false);
    }
  };

  const onImport = async () => {
    setBusy(true);
    try {
      const result = await importLocalBackupZip();
      Alert.alert(
        'Импорт',
        result.ok ? 'Бэкап восстановлен' : (result.message ?? 'Файл бэкапа не распознан'),
      );
    } catch (e) {
      Alert.alert('Ошибка импорта', e instanceof Error ? e.message : 'Не удалось импортировать бэкап');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SettingsPanel title="Резервное копирование">
      <AppText variant="caption" color="textSecondary">
        Частичный экспорт: тренировки, питание, тело, растяжка и sync_meta. Не включает все таблицы
        Health Connect и FormaSync. Импорт заменяет перечисленные таблицы в одной транзакции.
      </AppText>
      <View style={styles.row}>
        <AppButton
          label={busy ? 'Подождите…' : 'Экспорт + Поделиться'}
          onPress={() => void onExport()}
          loading={busy}
          size="sm"
        />
        <AppButton label="Импорт ZIP" variant="secondary" size="sm" onPress={() => void onImport()} />
      </View>
      {lastPath ? (
        <AppText variant="caption" color="textMuted">
          Последний файл: {lastPath}
        </AppText>
      ) : null}
    </SettingsPanel>
  );
}

const styles = StyleSheet.create({
  row: {flexDirection: 'row', flexWrap: 'wrap', gap: 8},
});
