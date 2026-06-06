import React, {useState} from 'react';
import {View} from 'react-native';

import {BodyMeasurementsTab} from '../BodyMeasurementsTab';
import {StepsTab} from '../StepsTab';
import {WeightTab} from '../WeightTab';
import {flexTabPanel} from '../../layout/screenContent';
import {AppTabs} from '../../design-system';
import type {PeriodDays} from './utils';

const TABS = ['Замеры', 'Вес', 'Шаги'] as const;
type Tab = (typeof TABS)[number];

const TAB_MAP: Record<Tab, 'measurements' | 'weight' | 'steps'> = {
  Замеры: 'measurements',
  Вес: 'weight',
  Шаги: 'steps',
};

type Props = {
  period?: PeriodDays;
};

export function AnalyticsBodyPanel({period = 30}: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('Замеры');
  const key = TAB_MAP[activeTab];
  const stepsPeriod: PeriodDays = period <= 14 ? 7 : period <= 30 ? 14 : 30;

  return (
    <View style={{gap: 12}}>
      <AppTabs options={TABS} value={activeTab} onChange={setActiveTab} scrollable compact />
      <View style={flexTabPanel}>
        {key === 'measurements' && <BodyMeasurementsTab />}
        {key === 'weight' && <WeightTab />}
        {key === 'steps' && <StepsTab periodDays={stepsPeriod} />}
      </View>
    </View>
  );
}
