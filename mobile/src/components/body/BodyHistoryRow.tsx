import React from 'react';
import {StyleSheet, View} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';

import {haptics} from '../../haptics';
import {AppCard} from '../../design-system/components/AppCard';
import {AppText} from '../../design-system/components/AppText';
import {PressableScale} from '../../design-system/motion/PressableScale';
import {useDesignSystem} from '../../design-system/useDesignSystem';

type Props = {
  date: string;
  detail: string;
  onDelete?: () => void;
  deleting?: boolean;
};

export function BodyHistoryRow({date, detail, onDelete, deleting}: Props) {
  const {colors, layout, space, iconSize, touch} = useDesignSystem();

  return (
    <AppCard padding="md" animateEnter={false} style={styles.card}>
      <View style={[styles.row, {minHeight: layout.listItemMinHeight}]}>
        <View style={styles.copy}>
          <AppText variant="title3" numberOfLines={1}>
            {date}
          </AppText>
          <AppText variant="caption" color="textSecondary" numberOfLines={2} style={{marginTop: space[1]}}>
            {detail}
          </AppText>
        </View>
        {onDelete ? (
          <PressableScale
            onPress={() => {
              haptics.warning();
              onDelete();
            }}
            disabled={deleting}
            scaleTo={0.92}
            hitSlop={10}
            style={[
              styles.deleteBtn,
              {
                minWidth: touch.minHeight,
                minHeight: touch.minHeight,
                borderRadius: layout.cardPadding,
                backgroundColor: colors.dangerMuted,
              },
            ]}>
            <Icon name="trash-outline" size={iconSize.md} color={colors.danger} />
          </PressableScale>
        ) : null}
      </View>
    </AppCard>
  );
}

const styles = StyleSheet.create({
  card: {marginBottom: 0},
  row: {flexDirection: 'row', alignItems: 'center', gap: 10},
  copy: {flex: 1, minWidth: 0},
  deleteBtn: {alignItems: 'center', justifyContent: 'center'},
});
