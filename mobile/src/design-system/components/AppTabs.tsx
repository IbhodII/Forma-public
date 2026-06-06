import React, {useEffect, useState} from 'react';
import {LayoutChangeEvent, ScrollView, StyleSheet, Text, View} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import {haptics} from '../../haptics';
import {useDesignSystem} from '../useDesignSystem';
import {PressableScale} from '../motion/PressableScale';
import {springs} from '../motion/springs';

type Props<T extends string> = {
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
  scrollable?: boolean;
  compact?: boolean;
};

export function AppTabs<T extends string>({
  options,
  value,
  onChange,
  scrollable = options.length > 4,
  compact,
}: Props<T>) {
  const {colors, radius, typography, shadows, space, isDark} = useDesignSystem();
  const [trackWidth, setTrackWidth] = useState(0);
  const activeIndex = options.indexOf(value);
  const pillX = useSharedValue(0);
  const inset = compact ? 2 : 3;
  const tabHeight = compact ? 30 : 34;

  const tabWidth = trackWidth > 0 ? trackWidth / options.length : 0;

  useEffect(() => {
    if (tabWidth > 0) {
      pillX.value = withSpring(activeIndex * tabWidth, springs.snappy);
    }
  }, [activeIndex, tabWidth, pillX]);

  const onTrackLayout = (e: LayoutChangeEvent) => {
    setTrackWidth(e.nativeEvent.layout.width);
  };

  const pillStyle = useAnimatedStyle(() => ({
    transform: [{translateX: pillX.value}],
    width: Math.max(tabWidth - inset * 2 - 2, 0),
  }));

  const track = (
    <View
      onLayout={onTrackLayout}
      style={[
        styles.track,
        {
          backgroundColor: isDark ? colors.bgElevated : colors.surfaceMuted,
          borderRadius: radius.pill,
          borderColor: colors.border,
          padding: inset,
        },
      ]}>
      {tabWidth > 0 ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.pill,
            pillStyle,
            {
              backgroundColor: colors.surface,
              borderRadius: radius.pill,
              top: inset,
              left: inset + 1,
              height: tabHeight,
            },
            shadows.sm,
          ]}
        />
      ) : null}
      {options.map(opt => {
        const active = opt === value;
        return (
          <PressableScale
            key={opt}
            onPress={() => {
              if (opt !== value) {
                haptics.tab();
              }
              onChange(opt);
            }}
            scaleTo={0.98}
            spring="snappy"
            haptic={false}
            style={[styles.tab, {minHeight: tabHeight, zIndex: 1}]}>
            <Text
              style={[
                active ? typography.bodyMedium : typography.caption,
                {
                  color: active ? colors.accent : colors.textMuted,
                  fontWeight: active ? '600' : '500',
                },
              ]}
              numberOfLines={1}>
              {opt}
            </Text>
          </PressableScale>
        );
      })}
    </View>
  );

  if (scrollable) {
    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{paddingVertical: space[1]}}>
        {track}
      </ScrollView>
    );
  }
  return track;
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    borderWidth: StyleSheet.hairlineWidth,
    position: 'relative',
  },
  pill: {
    position: 'absolute',
  },
  tab: {
    flex: 1,
    minWidth: 68,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
