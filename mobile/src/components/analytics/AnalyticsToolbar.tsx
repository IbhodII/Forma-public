import React from 'react';
import {StyleSheet, View} from 'react-native';

import type {PeriodDays} from './utils';
import {PeriodFilter} from './PeriodFilter';
import {AppTabs} from '../../design-system/components/AppTabs';
import {useDesignSystem} from '../../design-system/useDesignSystem';

type Props<T extends string> = {
  period: PeriodDays;
  onPeriodChange: (p: PeriodDays) => void;
  domains: readonly T[];
  domain: T;
  onDomainChange: (d: T) => void;
};

export function AnalyticsToolbar<T extends string>({
  period,
  onPeriodChange,
  domains,
  domain,
  onDomainChange,
}: Props<T>) {
  const {colors, space} = useDesignSystem();

  return (
    <View
      style={[
        styles.toolbar,
        {
          backgroundColor: colors.bg,
          gap: space[3],
          paddingBottom: space[3],
          borderBottomColor: colors.border,
        },
      ]}>
      <PeriodFilter value={period} onChange={onPeriodChange} variant="quick" />
      <AppTabs options={domains} value={domain} onChange={onDomainChange} scrollable compact />
    </View>
  );
}

const styles = StyleSheet.create({
  toolbar: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
