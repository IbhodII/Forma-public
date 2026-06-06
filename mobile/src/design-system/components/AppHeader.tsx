import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import Animated from 'react-native-reanimated';

import {useDesignSystem} from '../useDesignSystem';
import {PressableScale} from '../motion/PressableScale';
import {enterFade} from '../motion/entering';

type Props = {
  title: string;
  subtitle?: string;
  onClose?: () => void;
  /** Иконка кнопки закрытия: назад или крестик */
  closeIcon?: 'close' | 'back';
  rightAction?: React.ReactNode;
  large?: boolean;
  inset?: boolean;
};

export function AppHeader({
  title,
  subtitle,
  onClose,
  closeIcon = 'close',
  rightAction,
  large,
  inset = true,
}: Props) {
  const {colors, typography, layout, space, iconSize} = useDesignSystem();

  return (
    <Animated.View
      entering={enterFade(0)}
      style={[
        styles.row,
        inset && {
          paddingHorizontal: layout.screenPaddingX,
          paddingTop: space[2],
          paddingBottom: space[2],
        },
      ]}>
      <View style={styles.text}>
        <Text
          style={[
            large ? typography.display : typography.title1,
            {color: colors.text},
          ]}
          numberOfLines={2}>
          {title}
        </Text>
        {subtitle ? (
          <Text
            style={[
              typography.caption,
              {color: colors.textSecondary, marginTop: space[1], fontWeight: '500'},
            ]}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {rightAction}
      {onClose ? (
        <PressableScale
          onPress={onClose}
          scaleTo={0.92}
          spring="snappy"
          hitSlop={layout.iconHitSlop}>
          <View
            style={[
              styles.close,
              {
                backgroundColor: colors.surfaceMuted,
                borderColor: colors.border,
              },
            ]}>
            <Icon
              name={closeIcon === 'back' ? 'chevron-back' : 'close'}
              size={iconSize.lg}
              color={colors.textSecondary}
            />
          </View>
        </PressableScale>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 4,
  },
  text: {flex: 1, minWidth: 0},
  close: {
    width: 36,
    height: 36,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
