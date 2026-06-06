import React, {forwardRef} from 'react';
import {
  Platform,
  RefreshControl,
  type ScrollViewProps,
  StyleSheet,
} from 'react-native';
import Animated from 'react-native-reanimated';

type Props = ScrollViewProps & {
  /** iOS rubber-band (default true) */
  bounces?: boolean;
  /** Android edge glow (default true) */
  overScroll?: boolean;
  tintColor?: string;
  refreshing?: boolean;
  onRefresh?: () => void;
};

export const NativeScrollView = forwardRef<Animated.ScrollView, Props>(function NativeScrollView(
  {
    bounces = true,
    overScroll = true,
    showsVerticalScrollIndicator = false,
    keyboardDismissMode = 'on-drag',
    keyboardShouldPersistTaps = 'handled',
    decelerationRate = 'fast',
    scrollEventThrottle = 16,
    removeClippedSubviews = Platform.OS === 'android',
    nestedScrollEnabled = true,
    contentContainerStyle,
    tintColor,
    refreshing,
    onRefresh,
    children,
    ...rest
  },
  ref,
) {
  return (
    <Animated.ScrollView
      ref={ref}
      bounces={bounces}
      alwaysBounceVertical={bounces}
      overScrollMode={overScroll ? 'always' : 'never'}
      showsVerticalScrollIndicator={showsVerticalScrollIndicator}
      keyboardDismissMode={keyboardDismissMode}
      keyboardShouldPersistTaps={keyboardShouldPersistTaps}
      decelerationRate={decelerationRate}
      scrollEventThrottle={scrollEventThrottle}
      removeClippedSubviews={removeClippedSubviews}
      nestedScrollEnabled={nestedScrollEnabled}
      contentContainerStyle={[styles.grow, contentContainerStyle]}
      refreshControl={
        onRefresh ? (
          <RefreshControl
            refreshing={Boolean(refreshing)}
            onRefresh={onRefresh}
            tintColor={tintColor}
            colors={tintColor ? [tintColor] : undefined}
            progressViewOffset={Platform.OS === 'android' ? 8 : 0}
          />
        ) : undefined
      }
      {...rest}>
      {children}
    </Animated.ScrollView>
  );
});

const styles = StyleSheet.create({
  grow: {flexGrow: 1, width: '100%'},
});
