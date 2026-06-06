import React from 'react';
import {Text, type TextProps, type TextStyle} from 'react-native';

import {useDesignSystem} from '../useDesignSystem';
import type {TypeVariant} from '../tokens';

type ColorKey = 'text' | 'textSecondary' | 'textMuted' | 'textInverse' | 'accent' | 'danger' | 'success';

type Props = TextProps & {
  variant?: TypeVariant;
  color?: ColorKey | string;
  children: React.ReactNode;
};

export function AppText({variant = 'body', color = 'text', style, children, ...rest}: Props) {
  const {colors, typography} = useDesignSystem();
  const fg = color in colors ? colors[color as ColorKey] : color;
  return (
    <Text style={[typography[variant], {color: fg}, style as TextStyle]} {...rest}>
      {children}
    </Text>
  );
}
