import React, {useEffect, useRef, useState} from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import {NativeScrollView} from './NativeScrollView';
import Animated from 'react-native-reanimated';
import {GestureDetector} from 'react-native-gesture-handler';
import {useSafeAreaInsets} from 'react-native-safe-area-context';

import {AppHeader} from './AppHeader';
import {useDesignSystem} from '../useDesignSystem';
import {useSheetMotion} from '../motion/useSheetMotion';

type Props = {
  visible: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
  scroll?: boolean;
};

export function AppSheet({
  visible,
  title,
  subtitle,
  onClose,
  children,
  scroll = true,
}: Props) {
  const insets = useSafeAreaInsets();
  const {height} = useWindowDimensions();
  const {colors, radius, space, layout} = useDesignSystem();
  const sheetMax = height * 0.9;
  const [mounted, setMounted] = useState(visible);
  const dismissing = useRef(false);

  const handleClosed = () => {
    dismissing.current = false;
    setMounted(false);
    onClose();
  };

  const {pan, sheetStyle, backdropStyle, dismiss, animateClose} = useSheetMotion(
    mounted,
    handleClosed,
    height,
  );

  const requestDismiss = () => {
    if (dismissing.current) return;
    dismissing.current = true;
    dismiss();
  };

  useEffect(() => {
    if (visible) {
      dismissing.current = false;
      setMounted(true);
    } else if (mounted && !dismissing.current) {
      dismissing.current = true;
      animateClose(handleClosed);
    }
  }, [visible, mounted, animateClose]);

  const body = (
    <View style={{paddingHorizontal: layout.screenPaddingX, paddingBottom: space[4]}}>
      {children}
    </View>
  );

  if (!mounted) {
    return null;
  }

  return (
    <Modal visible transparent animationType="none" onRequestClose={requestDismiss}>
      <View style={styles.root}>
        <Pressable style={StyleSheet.absoluteFill} onPress={requestDismiss}>
          <Animated.View
            style={[StyleSheet.absoluteFill, {backgroundColor: colors.overlay}, backdropStyle]}
          />
        </Pressable>
        <GestureDetector gesture={pan}>
          <Animated.View
            style={[
              styles.sheet,
              sheetStyle,
              {
                backgroundColor: colors.surface,
                borderTopLeftRadius: radius.xxl,
                borderTopRightRadius: radius.xxl,
                maxHeight: sheetMax,
                paddingBottom: insets.bottom + space[4],
              },
            ]}>
            <View style={[styles.handle, {backgroundColor: colors.borderStrong}]} />
            <AppHeader title={title} subtitle={subtitle} onClose={requestDismiss} inset={false} />
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : undefined}
              style={styles.flex}>
              {scroll ? <NativeScrollView>{body}</NativeScrollView> : body}
            </KeyboardAvoidingView>
          </Animated.View>
        </GestureDetector>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, justifyContent: 'flex-end'},
  flex: {flexGrow: 0, flexShrink: 1},
  sheet: {paddingTop: 8, width: '100%'},
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 8,
  },
});
