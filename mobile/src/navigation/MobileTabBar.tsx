import React, {useEffect} from 'react';
import {LayoutChangeEvent, StyleSheet, Text, View} from 'react-native';
import type {BottomTabBarProps} from '@react-navigation/bottom-tabs';
import Icon from 'react-native-vector-icons/Ionicons';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import Animated, {FadeIn, FadeOut} from 'react-native-reanimated';

import {haptics} from '../haptics';
import {useDesignSystem} from '../design-system/useDesignSystem';
import {PressableScale} from '../design-system/motion/PressableScale';
import {getTabIconMeta} from './tabBarIcons';
import {
  TAB_BAR_CONTENT_HEIGHT,
  TAB_BAR_FLOAT_MARGIN_BOTTOM,
  TAB_BAR_VERTICAL_PADDING,
} from './tabBarMetrics';
import {useTabBarLayoutActions} from './TabBarLayoutContext';

export {
  TAB_BAR_CHROME_HEIGHT,
  TAB_BAR_CLEARANCE,
  TAB_BAR_CONTENT_HEIGHT,
} from './tabBarMetrics';

function TabButton({
  focused,
  label,
  icon,
  iconActive,
  onPress,
}: {
  focused: boolean;
  label: string;
  icon: string;
  iconActive: string;
  onPress: () => void;
}) {
  const {colors, iconSize, radius, space} = useDesignSystem();
  const inactiveColor = colors.textSecondary;
  const iconColor = focused ? colors.accent : inactiveColor;
  const labelColor = focused ? colors.accent : inactiveColor;
  const iconName = focused ? iconActive : icon;

  return (
    <PressableScale
      onPress={onPress}
      scaleTo={0.94}
      spring="tab"
      style={styles.tab}
      hitSlop={4}
      haptic={false}
      android_ripple={{color: colors.accentMuted, borderless: true}}>
      {focused ? (
        <Animated.View
          entering={FadeIn.duration(120)}
          exiting={FadeOut.duration(80)}
          style={[
            styles.activePill,
            {
              backgroundColor: colors.accentMuted,
              borderRadius: radius.pill,
              paddingHorizontal: space[2] + 2,
              paddingVertical: space[1] + 2,
            },
          ]}>
          <Icon name={iconName} size={iconSize.lg} color={iconColor} />
          <Text style={[styles.label, styles.labelActive, {color: labelColor}]} numberOfLines={1}>
            {label}
          </Text>
        </Animated.View>
      ) : (
        <View style={styles.inactiveSlot}>
          <Icon name={iconName} size={iconSize.lg} color={inactiveColor} style={styles.inactiveIcon} />
          <Text
            style={[styles.label, styles.labelInactive, {color: labelColor}]}
            numberOfLines={1}>
            {label}
          </Text>
        </View>
      )}
    </PressableScale>
  );
}

export function MobileTabBar({state, descriptors, navigation}: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const {colors, shadows, layout, space} = useDesignSystem();
  const setWrapperLayout = useTabBarLayoutActions();
  const safeBottomPad = Math.max(insets.bottom, space[2]);
  const floatBottom = TAB_BAR_FLOAT_MARGIN_BOTTOM + safeBottomPad;

  const onWrapperLayout = (e: LayoutChangeEvent) => {
    setWrapperLayout(e.nativeEvent.layout.height, safeBottomPad);
  };

  useEffect(() => {
    Icon.loadFont().catch(() => {
      // Ignore icon-font load race; default bundle path still applies.
    });
  }, []);

  return (
    <View
      onLayout={onWrapperLayout}
      pointerEvents="box-none"
      style={[styles.wrapper, {paddingBottom: floatBottom}]}>
      <View
        style={[
          styles.dock,
          shadows.tabBarFloat,
          {
            marginHorizontal: layout.tabBarFloatMarginH,
            borderRadius: layout.tabBarRadius,
            backgroundColor: colors.surfaceGlass,
            borderColor: colors.border,
          },
        ]}>
        <View
          style={[
            styles.bar,
            {
              paddingVertical: TAB_BAR_VERTICAL_PADDING,
              paddingHorizontal: space[2],
              minHeight: TAB_BAR_CONTENT_HEIGHT,
            },
          ]}>
          {state.routes.map((route, index) => {
            const focused = state.index === index;
            const {options} = descriptors[route.key];
            const tabBarLabel =
              typeof options.tabBarLabel === 'string'
                ? options.tabBarLabel
                : options.title ?? route.name;
            const meta = getTabIconMeta(route.name, tabBarLabel);

            return (
              <TabButton
                key={route.key}
                focused={focused}
                label={meta.short}
                icon={meta.icon}
                iconActive={meta.iconActive}
                onPress={() => {
                  const e = navigation.emit({
                    type: 'tabPress',
                    target: route.key,
                    canPreventDefault: true,
                  });
                  if (!focused && !e.defaultPrevented) {
                    haptics.tab();
                    navigation.navigate(route.name);
                  }
                }}
              />
            );
          })}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 10,
    elevation: 10,
  },
  dock: {
    borderWidth: StyleSheet.hairlineWidth + 0.5,
    overflow: 'hidden',
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 0,
  },
  activePill: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  inactiveSlot: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    opacity: 0.95,
  },
  inactiveIcon: {},
  label: {fontSize: 10, fontWeight: '500', maxWidth: 56},
  labelActive: {fontWeight: '700'},
  labelInactive: {fontWeight: '500'},
});
