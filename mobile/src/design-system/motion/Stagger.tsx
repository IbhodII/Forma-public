import React from 'react';
import {type StyleProp, type ViewStyle} from 'react-native';
import Animated from 'react-native-reanimated';

import {enterFadeDown} from './entering';

type ItemProps = {
  index: number;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
};

export function StaggerItem({index, children, style}: ItemProps) {
  return (
    <Animated.View entering={enterFadeDown(index)} style={style}>
      {children}
    </Animated.View>
  );
}

type GroupProps = {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
};

/** Wrap mapped list items; each child should be a single element with key */
export function StaggerGroup({children, style}: GroupProps) {
  return <Animated.View style={style}>{children}</Animated.View>;
}
