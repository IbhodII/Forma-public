import React from 'react';
import {View} from 'react-native';

import type {FoodPhase} from '../../types/food';
import {AppChip} from '../../design-system/components/AppChip';
import {useDesignSystem} from '../../design-system/useDesignSystem';

type Props = {
  phase: FoodPhase;
  onChange: (p: FoodPhase) => void;
};

export function FoodPhaseToggle({phase, onChange}: Props) {
  const {layout} = useDesignSystem();

  return (
    <View style={{flexDirection: 'row', gap: layout.stackGap}}>
      <AppChip
        label="Сушка"
        variant="pill"
        active={phase === 'cut'}
        onPress={() => onChange('cut')}
      />
      <AppChip
        label="Набор"
        variant="pill"
        active={phase === 'bulk'}
        onPress={() => onChange('bulk')}
      />
    </View>
  );
}
