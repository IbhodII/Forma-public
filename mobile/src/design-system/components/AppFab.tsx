import React, {useEffect} from 'react';
import {StyleSheet, View, type StyleProp, type ViewStyle} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
} from 'react-native-reanimated';

import {haptics} from '../../haptics';
import {useDesignSystem} from '../useDesignSystem';
import {PressableScale} from '../motion/PressableScale';
import {springs} from '../motion/springs';
import {BrandGradient} from './BrandGradient';

type Props = {
  icon?: string;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
};

export function AppFab({
  icon = 'add',
  onPress,
  style,
  accessibilityLabel = 'Добавить',
}: Props) {
  const {colors, shadows, iconSize, radius} = useDesignSystem();
  const scale = useSharedValue(0.6);
  const opacity = useSharedValue(0);

  useEffect(() => {
    scale.value = withDelay(120, withSpring(1, springs.soft));
    opacity.value = withDelay(80, withSpring(1, springs.gentle));
  }, [opacity, scale]);

  const enterStyle = useAnimatedStyle(() => ({
    transform: [{scale: scale.value}],
    opacity: opacity.value,
  }));

  return (
    <Animated.View style={[styles.wrap, enterStyle, style]}>
      <PressableScale
        onPress={onPress}
        haptic="soft"
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        scaleTo={0.94}
        spring="snappy">
        <Animated.View style={[styles.fab, shadows.fab, {borderRadius: radius.xl, overflow: 'hidden'}]}>
          <BrandGradient variant="primary" />
          <View style={styles.icon}>
            <Icon name={icon} size={iconSize.lg} color={colors.accentText} />
          </View>
        </Animated.View>
      </PressableScale>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    right: 20,
    bottom: 120,
    zIndex: 20,
  },
  fab: {
    width: 56,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: {zIndex: 1},
});
