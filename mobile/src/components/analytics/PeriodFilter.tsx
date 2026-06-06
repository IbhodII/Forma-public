import React, {useState} from 'react';
import {View} from 'react-native';

import {AppChip} from '../../design-system/components/AppChip';
import {AppTabs} from '../../design-system/components/AppTabs';
import type {PeriodDays} from './utils';

const QUICK_OPTIONS: {id: PeriodDays; label: string}[] = [
  {id: 7, label: '7д'},
  {id: 14, label: '14д'},
  {id: 30, label: '30д'},
];

const EXTENDED_OPTIONS: {id: PeriodDays; label: string}[] = [
  {id: 42, label: '42д'},
  {id: 90, label: '90д'},
];

type Props = {
  value: PeriodDays;
  onChange: (v: PeriodDays) => void;
  /** When true, only 7/14/30 chips plus optional extended row. */
  variant?: 'full' | 'quick';
};

export function PeriodFilter({value, onChange, variant = 'full'}: Props) {
  const [showExtended, setShowExtended] = useState(
    () => variant === 'full' || EXTENDED_OPTIONS.some(o => o.id === value),
  );

  if (variant === 'full') {
    const all = [...QUICK_OPTIONS, ...EXTENDED_OPTIONS];
    const tabs = all.map(o => o.label);
    const idByLabel = Object.fromEntries(all.map(o => [o.label, o.id])) as Record<
      string,
      PeriodDays
    >;
    const activeLabel = all.find(o => o.id === value)?.label ?? '30д';
    return (
      <AppTabs
        options={tabs as unknown as readonly string[]}
        value={activeLabel}
        onChange={label => onChange(idByLabel[label] ?? 30)}
        scrollable
        compact
      />
    );
  }

  const activeQuick = QUICK_OPTIONS.find(o => o.id === value)?.label;

  return (
    <View style={{gap: 8}}>
      <AppTabs
        options={QUICK_OPTIONS.map(o => o.label) as unknown as readonly string[]}
        value={activeQuick ?? '30д'}
        onChange={label => {
          const id = QUICK_OPTIONS.find(o => o.label === label)?.id ?? 30;
          onChange(id);
        }}
        scrollable
        compact
      />
      <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center'}}>
        <AppChip
          label={showExtended ? 'Скрыть 42/90' : 'Ещё'}
          variant="pill"
          active={showExtended}
          onPress={() => setShowExtended(v => !v)}
        />
        {showExtended
          ? EXTENDED_OPTIONS.map(o => (
              <AppChip
                key={o.id}
                label={o.label}
                variant="pill"
                active={value === o.id}
                onPress={() => onChange(o.id)}
              />
            ))
          : EXTENDED_OPTIONS.some(o => o.id === value) ? (
              <AppChip
                label={EXTENDED_OPTIONS.find(o => o.id === value)!.label}
                variant="pill"
                active
                onPress={() => setShowExtended(true)}
              />
            ) : null}
      </View>
    </View>
  );
}
