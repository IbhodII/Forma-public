import React from 'react';
import {useNavigation} from '@react-navigation/native';
import type {BottomTabNavigationProp} from '@react-navigation/bottom-tabs';

import {TAB} from '../../navigation/routes';
import {AppButton, AppEmptyState} from '../../design-system';

export type AnalyticsEmptyKind =
  | 'load_ctl'
  | 'zone_hr'
  | 'strength'
  | 'body_weight'
  | 'steps'
  | 'hc_trends'
  | 'energy';

const COPY: Record<
  AnalyticsEmptyKind,
  {title: string; message: string; cta?: string; tab?: string}
> = {
  load_ctl: {
    title: 'Нет данных нагрузки',
    message: 'Добавьте кардио или силовые тренировки — CTL и ATL появятся после нескольких дней.',
    cta: 'К тренировкам',
    tab: TAB.Workouts,
  },
  zone_hr: {
    title: 'Нет зон пульса',
    message: 'Запишите кардио с пульсом или импортируйте тренировку с датчиком.',
    cta: 'Кардио',
    tab: TAB.Workouts,
  },
  strength: {
    title: 'Нет силовых данных',
    message: 'Запишите силовую тренировку, чтобы видеть прогресс и объём.',
    cta: 'К тренировкам',
    tab: TAB.Workouts,
  },
  body_weight: {
    title: 'Мало точек веса',
    message: 'Добавьте хотя бы два измерения веса для графика тренда.',
    cta: 'Добавить вес',
  },
  steps: {
    title: 'Нет шагов',
    message: 'Синхронизируйте Health Connect или подключите API ПК для истории шагов.',
    cta: 'Health Connect',
    tab: TAB.HealthConnect,
  },
  hc_trends: {
    title: 'Нет данных Health Connect',
    message: 'Включите сбор и нажмите «Синхронизировать сейчас» на экране Health Connect.',
    cta: 'Health Connect',
    tab: TAB.HealthConnect,
  },
  energy: {
    title: 'Нет расхода энергии',
    message: 'Тренировки за период не найдены — график ккал появится после активности.',
    cta: 'К тренировкам',
    tab: TAB.Workouts,
  },
};

type TabNav = BottomTabNavigationProp<Record<string, undefined>>;

type Props = {
  kind: AnalyticsEmptyKind;
  compact?: boolean;
  onAction?: () => void;
};

export function AnalyticsEmptyState({kind, compact, onAction}: Props) {
  const navigation = useNavigation<TabNav>();
  const cfg = COPY[kind];

  return (
    <>
      <AppEmptyState title={cfg.title} message={cfg.message} compact={compact} />
      {cfg.cta ? (
        <AppButton
          label={cfg.cta}
          variant="soft"
          size="sm"
          onPress={() => {
            if (onAction) {
              onAction();
              return;
            }
            if (cfg.tab) {
              navigation.navigate(cfg.tab as never);
            }
          }}
          fullWidth
        />
      ) : null}
    </>
  );
}
