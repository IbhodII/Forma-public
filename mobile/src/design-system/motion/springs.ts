/** Spring presets — tactile but restrained (iOS / native feel) */
export const springs = {
  snappy: {damping: 20, stiffness: 420, mass: 0.32},
  soft: {damping: 22, stiffness: 280, mass: 0.42},
  gentle: {damping: 24, stiffness: 210, mass: 0.48},
  sheet: {damping: 26, stiffness: 340, mass: 0.5, overshootClamping: false},
  tab: {damping: 18, stiffness: 360, mass: 0.38},
} as const;

export type SpringPreset = keyof typeof springs;
