import {FadeIn, FadeInDown, FadeInUp} from 'react-native-reanimated';

import {motion} from '../tokens';

const BASE = motion.durationNormal;
const STAGGER = motion.staggerStep;

/** Contextual enter — subtle vertical drift + fade */
export function enterFadeDown(index = 0) {
  const delay = Math.min(index * STAGGER, motion.staggerMax);
  return FadeInDown.duration(BASE)
    .delay(delay)
    .springify()
    .damping(22)
    .stiffness(280);
}

export function enterFadeUp(index = 0) {
  const delay = Math.min(index * STAGGER, motion.staggerMax);
  return FadeInUp.duration(BASE)
    .delay(delay)
    .springify()
    .damping(22)
    .stiffness(280);
}

export function enterFade(index = 0) {
  const delay = Math.min(index * STAGGER, motion.staggerMax);
  return FadeIn.duration(motion.durationFast).delay(delay);
}
