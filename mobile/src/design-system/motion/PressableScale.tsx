import React from 'react';
import {Pressable, type PressableProps, type StyleProp, type ViewStyle} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import type {HapticKind} from '../../haptics/types';
import {trigger} from '../../haptics/trigger';
import {motion} from '../tokens';
import {springs, type SpringPreset} from './springs';

type Props = PressableProps & {
  children: React.ReactNode;
  scaleTo?: number;
  opacityTo?: number;
  spring?: SpringPreset;
  wrapperStyle?: StyleProp<ViewStyle>;
  /** Light impulse on press — omit for dense lists */
  haptic?: HapticKind | false;
};

export function PressableScale({
  children,
  scaleTo = motion.pressScale,
  opacityTo = motion.pressOpacity,
  spring = 'snappy',
  disabled,
  wrapperStyle,
  style,
  haptic = false,
  onPressIn,
  onPressOut,
  ...rest
}: Props) {
  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);
  const cfg = springs[spring];

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{scale: scale.value}],
    opacity: opacity.value,
  }));

  return (
    <Pressable
      disabled={disabled}
      style={style}
      onPressIn={e => {
        if (!disabled) {
          scale.value = withSpring(scaleTo, cfg);
          opacity.value = withSpring(opacityTo, cfg);
          if (haptic) {
            trigger(haptic);
          }
        }
        onPressIn?.(e);
      }}
      onPressOut={e => {
        scale.value = withSpring(1, cfg);
        opacity.value = withSpring(1, cfg);
        onPressOut?.(e);
      }}
      {...rest}>
      <Animated.View style={[animatedStyle, wrapperStyle]}>{children}</Animated.View>
    </Pressable>
  );
}
