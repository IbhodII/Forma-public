import {useCallback, useEffect} from 'react';
import {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import {Gesture} from 'react-native-gesture-handler';

import {haptics} from '../../haptics';
import {motion} from '../tokens';
import {springs} from './springs';

export function useSheetMotion(
  open: boolean,
  onClosed: () => void,
  travelDistance: number,
) {
  const translateY = useSharedValue(travelDistance);
  const backdrop = useSharedValue(0);

  const animateOpen = useCallback(() => {
    haptics.sheetOpen();
    translateY.value = travelDistance;
    backdrop.value = 0;
    backdrop.value = withTiming(1, {duration: motion.durationNormal});
    translateY.value = withSpring(0, springs.sheet);
  }, [backdrop, translateY, travelDistance]);

  const animateClose = useCallback(
    (after?: () => void) => {
      backdrop.value = withTiming(0, {duration: motion.durationFast});
      translateY.value = withSpring(travelDistance, springs.soft, finished => {
        if (finished) {
          if (after) {
            runOnJS(after)();
          }
        }
      });
    },
    [backdrop, translateY, travelDistance],
  );

  useEffect(() => {
    if (open) {
      animateOpen();
    }
  }, [open, animateOpen]);

  const dismiss = useCallback(() => {
    haptics.sheetClose();
    animateClose(onClosed);
  }, [animateClose, onClosed]);

  const pan = Gesture.Pan()
    .activeOffsetY(6)
    .onUpdate(e => {
      if (e.translationY > 0) {
        translateY.value = e.translationY * 0.96;
        backdrop.value = Math.max(0, 1 - e.translationY / (travelDistance * 0.5));
      } else {
        translateY.value = e.translationY * 0.22;
      }
    })
    .onEnd(e => {
      if (e.translationY > motion.sheetDismissDistance || e.velocityY > 750) {
        runOnJS(dismiss)();
      } else {
        translateY.value = withSpring(0, springs.sheet);
        backdrop.value = withTiming(1, {duration: motion.durationFast});
      }
    });

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{translateY: translateY.value}],
  }));

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdrop.value,
  }));

  return {pan, sheetStyle, backdropStyle, dismiss, animateClose};
}
