import React, {useState} from 'react';
import {View} from 'react-native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';

import {StretchingJourneyTab} from '../StretchingJourneyTab';
import {StretchingExercisesTab} from '../StretchingExercisesTab';
import {StretchingHistoryTab} from '../StretchingHistoryTab';
import {StretchingPresetsTab} from '../StretchingPresetsTab';
import {flexTabPanel} from '../../layout/screenContent';
import {AppTabs} from '../../design-system';
import type {WorkoutsStackParamList} from '../../navigation/WorkoutsStack';

const TABS = ['Сегодня', 'История', 'Пресеты', 'Упражнения'] as const;
type Tab = (typeof TABS)[number];
const TAB_KEY: Record<Tab, 'today' | 'history' | 'presets' | 'exercises'> = {
  Сегодня: 'today',
  История: 'history',
  Пресеты: 'presets',
  Упражнения: 'exercises',
};

type Nav = NativeStackNavigationProp<WorkoutsStackParamList>;

export function StretchingHubPanel({navigation}: {navigation: Nav}) {
  const [activeTab, setActiveTab] = useState<Tab>('Сегодня');
  const key = TAB_KEY[activeTab];

  return (
    <View style={{flex: 1}}>
      <AppTabs options={TABS} value={activeTab} onChange={setActiveTab} />
      <View style={flexTabPanel}>
        {key === 'today' && <StretchingJourneyTab />}
        {key === 'history' && <StretchingHistoryTab />}
        {key === 'presets' && (
          <StretchingPresetsTab
            onStartSession={(presetId: number) =>
              navigation.navigate('StretchingSession', {presetId})
            }
          />
        )}
        {key === 'exercises' && <StretchingExercisesTab />}
      </View>
    </View>
  );
}
