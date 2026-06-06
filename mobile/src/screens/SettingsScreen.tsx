import React, {useCallback, useEffect, useState} from 'react';
import {View} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';

import {AboutSettings} from '../components/AboutSettings';
import {BackupSettings} from '../components/BackupSettings';
import {BikeSettings} from '../components/BikeSettings';
import {ConflictCenterModal} from '../components/ConflictCenterModal';
import {InterfaceSettings} from '../components/InterfaceSettings';
import {NutritionSettings} from '../components/NutritionSettings';
import {ProfileSettings} from '../components/ProfileSettings';
import {SyncAndCloudSettings} from '../components/SyncAndCloudSettings';
import {SettingsProfileHero} from '../components/settings/SettingsProfileHero';
import {SettingsSection} from '../components/settings/SettingsSection';
import {countUnresolvedConflicts} from '../database/conflictStore';
import {subscribeConflicts} from '../services/SyncService';
import {useAuth} from '../auth/AuthContext';
import type {SettingsStackParamList} from '../navigation/SettingsStack';
import {AppButton, AppCard, AppScreen, AppText} from '../design-system';
import {useDesignSystem} from '../design-system/useDesignSystem';

type SettingsNav = NativeStackNavigationProp<SettingsStackParamList, 'SettingsHome'>;

export default function SettingsScreen() {
  const navigation = useNavigation<SettingsNav>();
  const {space, layout} = useDesignSystem();
  const {logout} = useAuth();
  const [conflictOpen, setConflictOpen] = useState(false);
  const [conflictCount, setConflictCount] = useState(0);

  const reloadConflicts = useCallback(async () => {
    setConflictCount(await countUnresolvedConflicts());
  }, []);

  useEffect(() => {
    void reloadConflicts();
    return subscribeConflicts(() => {
      void reloadConflicts();
    });
  }, [reloadConflicts]);

  return (
    <>
      <AppScreen title="Настройки" subtitle="Профиль и интеграции">
        <View style={{gap: layout.sectionGap}}>
        <SettingsProfileHero />

        {conflictCount > 0 ? (
          <AppButton
            label={`Конфликты синхронизации (${conflictCount})`}
            variant="danger"
            icon="warning"
            onPress={() => setConflictOpen(true)}
            fullWidth
          />
        ) : null}

        <AppCard padding="lg" style={{gap: space[2]}}>
          <AppText variant="title3">Разделы</AppText>
          <AppButton
            label="Синхронизация"
            variant="secondary"
            icon="cloud-outline"
            onPress={() => navigation.navigate('SyncHub')}
            fullWidth
          />
          <AppButton
            label="Health Connect"
            variant="secondary"
            icon="heart-outline"
            onPress={() => navigation.navigate('HealthConnectDiagnostics')}
            fullWidth
          />
        </AppCard>

        <SettingsSection title="Профиль" icon="person-outline" defaultOpen>
          <ProfileSettings />
        </SettingsSection>

        <SettingsSection title="Питание" icon="nutrition-outline" subtitle="Макросы и цели">
          <NutritionSettings />
        </SettingsSection>

        <SettingsSection
          title="Интеграции"
          icon="cloud-outline"
          subtitle="Мобильная синхронизация и облако">
          <SyncAndCloudSettings />
        </SettingsSection>

        <SettingsSection title="Резервные копии" icon="archive-outline">
          <BackupSettings />
        </SettingsSection>

        <SettingsSection title="Велосипед" icon="bicycle-outline">
          <BikeSettings />
        </SettingsSection>

        <SettingsSection title="Интерфейс" icon="color-palette-outline" defaultOpen>
          <InterfaceSettings />
        </SettingsSection>

        <View style={{marginTop: space[2]}}>
          <AppButton
            label="Выйти из аккаунта"
            variant="ghost"
            icon="log-out-outline"
            onPress={() => void logout()}
            fullWidth
          />
        </View>

        <SettingsSection title="О приложении" icon="information-circle-outline">
          <AboutSettings />
        </SettingsSection>
        </View>
      </AppScreen>

      <ConflictCenterModal
        visible={conflictOpen}
        onClose={() => {
          setConflictOpen(false);
          void reloadConflicts();
        }}
      />
    </>
  );
}
