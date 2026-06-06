import React, {memo} from 'react';
import {StyleSheet, View} from 'react-native';

import {AppCard, AppText, SectionHeader} from '../../design-system';
import {useDesignSystem} from '../../design-system/useDesignSystem';

type Props = {
  strengthTitle: string | null;
  strengthDate: string | null;
  cardioTitle: string | null;
  cardioDate: string | null;
};

export const DashboardActivityRow = memo(function DashboardActivityRow({
  strengthTitle,
  strengthDate,
  cardioTitle,
  cardioDate,
}: Props) {
  const {space} = useDesignSystem();

  if (!strengthTitle && !cardioTitle) {
    return null;
  }

  return (
    <View style={{marginBottom: space[3]}}>
      <SectionHeader title="Недавняя активность" />
      <View style={[styles.row, {gap: space[2], marginTop: space[2]}]}>
        {strengthTitle ? (
          <AppCard padding="md" style={styles.card}>
            <AppText variant="caption" color="textMuted">
              Силовая
            </AppText>
            <AppText variant="body" style={{fontWeight: '600', marginTop: 4}} numberOfLines={2}>
              {strengthTitle}
            </AppText>
            {strengthDate ? (
              <AppText variant="caption" color="textSecondary">
                {strengthDate}
              </AppText>
            ) : null}
          </AppCard>
        ) : null}
        {cardioTitle ? (
          <AppCard padding="md" style={styles.card}>
            <AppText variant="caption" color="textMuted">
              Кардио
            </AppText>
            <AppText variant="body" style={{fontWeight: '600', marginTop: 4}} numberOfLines={2}>
              {cardioTitle}
            </AppText>
            {cardioDate ? (
              <AppText variant="caption" color="textSecondary">
                {cardioDate}
              </AppText>
            ) : null}
          </AppCard>
        ) : null}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
  },
  card: {
    flex: 1,
  },
});
