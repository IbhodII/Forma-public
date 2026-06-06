import React, {useState} from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  StatusBar,
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated from 'react-native-reanimated';
import {useSafeAreaInsets} from 'react-native-safe-area-context';

import {stickyHeader} from '../../layout/screenContent';
import {useTabBarBottomInset} from '../../navigation/TabBarLayoutContext';
import {AppHeader} from './AppHeader';
import {NativeScrollView} from './NativeScrollView';
import {useDesignSystem} from '../useDesignSystem';
import {useScreenEnter} from '../motion/useScreenEnter';

type Props = {
  title?: string;
  subtitle?: string;
  rightAction?: React.ReactNode;
  children: React.ReactNode;
  scroll?: boolean;
  largeTitle?: boolean;
  noPadding?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
  refreshing?: boolean;
  onRefresh?: () => void;
  animateOnFocus?: boolean;
  stickyFooter?: React.ReactNode;
  /** Default true when scroll is enabled */
  keyboardAvoiding?: boolean;
};

export function AppScreen({
  title,
  subtitle,
  rightAction,
  children,
  scroll = true,
  largeTitle,
  noPadding,
  contentStyle,
  refreshing,
  onRefresh,
  animateOnFocus = true,
  stickyFooter,
  keyboardAvoiding = scroll,
}: Props) {
  const insets = useSafeAreaInsets();
  const {colors, layout, isDark} = useDesignSystem();
  const enterStyle = useScreenEnter(animateOnFocus);
  const [footerHeight, setFooterHeight] = useState(0);

  const safeBottom = Math.max(insets.bottom, 0);
  const tabBarBottom = useTabBarBottomInset(safeBottom);

  const scrollBottomPad = stickyFooter
    ? footerHeight + tabBarBottom
    : tabBarBottom;

  const onFooterLayout = (e: LayoutChangeEvent) => {
    setFooterHeight(e.nativeEvent.layout.height);
  };

  const body = (
    <Animated.View
      style={[
        enterStyle,
        !noPadding && {paddingHorizontal: layout.screenPaddingX},
        {
          paddingTop: layout.screenPaddingTop,
          paddingBottom: scrollBottomPad,
          gap: layout.blockGap,
        },
        !scroll && styles.flexFill,
        contentStyle,
      ]}>
      {children}
    </Animated.View>
  );

  const scrollBody = scroll ? (
    <NativeScrollView
      tintColor={colors.accent}
      refreshing={refreshing}
      onRefresh={onRefresh}
      style={styles.flex}>
      {body}
    </NativeScrollView>
  ) : (
    <View style={[styles.flex, styles.flexMin]}>{body}</View>
  );

  const main = (
    <View style={[styles.root, {backgroundColor: colors.bg, paddingTop: insets.top}]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.bg} />
      {title != null ? (
        <AppHeader
          title={title}
          subtitle={subtitle}
          rightAction={rightAction}
          large={largeTitle}
        />
      ) : null}
      <View style={styles.flex}>{scrollBody}</View>
      {stickyFooter ? (
        <View
          style={[
            styles.footer,
            stickyHeader.bar,
            {
              paddingBottom: tabBarBottom,
              paddingHorizontal: layout.screenPaddingX,
              backgroundColor: colors.bg,
              borderTopColor: colors.border,
            },
          ]}>
          <View onLayout={onFooterLayout} style={{paddingTop: layout.stackGap}}>
            {stickyFooter}
          </View>
        </View>
      ) : null}
    </View>
  );

  if (keyboardAvoiding) {
    return (
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top : 0}>
        {main}
      </KeyboardAvoidingView>
    );
  }

  return main;
}

const styles = StyleSheet.create({
  root: {flex: 1},
  flex: {flex: 1},
  flexMin: {minHeight: 0},
  flexFill: {flex: 1, minHeight: 0},
  footer: {
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
