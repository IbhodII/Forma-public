import {useCallback, useRef} from 'react';
import {useFocusEffect} from '@react-navigation/native';
import {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import {motion} from '../tokens';
import {springs} from './springs';

/** Subtle lift when a tab screen gains focus (no opacity dimming). */
export function useScreenEnter(enabled = true) {
  const translateY = useSharedValue(0);
  const firstFocus = useRef(true);

  useFocusEffect(
    useCallback(() => {
      if (!enabled) return;

      if (firstFocus.current) {
        firstFocus.current = false;
        translateY.value = 0;
        return;
      }

      translateY.value = motion.enterTranslateY * 0.6;
      translateY.value = withSpring(0, springs.gentle);

      const fallback = setTimeout(() => {
        translateY.value = 0;
      }, motion.durationNormal + 100);

      return () => clearTimeout(fallback);
    }, [enabled, translateY]),
  );

  const style = useAnimatedStyle(() => ({
    opacity: 1,
    transform: [{translateY: translateY.value}],
  }));

  return style;
}
