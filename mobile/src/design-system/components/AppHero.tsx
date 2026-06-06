import React, {useState} from 'react';
import {StyleSheet, View, type LayoutChangeEvent, type StyleProp, type ViewStyle} from 'react-native';
import Animated from 'react-native-reanimated';
import Svg, {Circle, Defs, LinearGradient, Rect, Stop} from 'react-native-svg';

import {useDesignSystem} from '../useDesignSystem';
import {enterFadeUp} from '../motion/entering';

type Props = {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  height?: number;
  /** Shorter decoration (fewer orbs), not a fixed height cap */
  compact?: boolean;
};

export function AppHero({children, style, height, compact}: Props) {
  const {radius, shadows, layout, hero, isDark, colors} = useDesignSystem();
  const minHeight = height ?? (compact ? layout.heroHeightCompact : layout.heroHeight);
  const r = radius.md;
  const [layoutWidth, setLayoutWidth] = useState(0);
  const [contentHeight, setContentHeight] = useState(0);

  const onWrapLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    if (w > 0 && w !== layoutWidth) {
      setLayoutWidth(w);
    }
  };

  const onContentLayout = (e: LayoutChangeEvent) => {
    const h = Math.ceil(e.nativeEvent.layout.height);
    if (h > 0 && h !== contentHeight) {
      setContentHeight(h);
    }
  };

  const svgWidth = layoutWidth > 0 ? layoutWidth : 1;
  const bgHeight = Math.max(minHeight, contentHeight);
  const vignetteBottom = isDark ? 0.28 : 0.22;
  const vignetteRectOpacity = isDark ? (compact ? 0.2 : 0.24) : compact ? 0.18 : 0.22;
  const orbMain = isDark ? (compact ? 0.06 : 0.08) : compact ? 0.065 : 0.085;
  const orbSecondary = isDark ? 0.065 : 0.08;

  return (
    <Animated.View
      entering={enterFadeUp(0)}
      onLayout={onWrapLayout}
      style={[
        styles.wrap,
        shadows.sm,
        {borderRadius: r, minHeight, alignSelf: 'stretch', maxWidth: '100%'},
        style,
      ]}>
      {layoutWidth > 0 && bgHeight > 0 ? (
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.bgClip, {borderRadius: r}]}>
          <Svg width={svgWidth} height={bgHeight}>
            <Defs>
              <LinearGradient id="formaHero" x1="0" y1="0" x2="1" y2="1">
                <Stop offset="0" stopColor={hero.start} />
                <Stop offset="0.5" stopColor={hero.mid} />
                <Stop offset="1" stopColor={hero.end} />
              </LinearGradient>
              <LinearGradient id="formaHeroVignette" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={colors.shadow} stopOpacity="0" />
                <Stop offset="1" stopColor={colors.shadow} stopOpacity={vignetteBottom} />
              </LinearGradient>
            </Defs>
            <Rect width="100%" height="100%" rx={r} fill="url(#formaHero)" />
            <Circle
              cx={svgWidth * 0.82}
              cy={bgHeight * 0.22}
              r={bgHeight * (compact ? 0.42 : 0.5)}
              fill={hero.orbA}
              opacity={orbMain}
            />
            {!compact ? (
              <Circle
                cx={svgWidth * 0.08}
                cy={bgHeight * 0.85}
                r={bgHeight * 0.38}
                fill={hero.orbB}
                opacity={orbSecondary}
              />
            ) : null}
            <Rect width="100%" height="100%" rx={r} fill="url(#formaHeroVignette)" opacity={vignetteRectOpacity} />
          </Svg>
        </View>
      ) : null}
      <View
        onLayout={onContentLayout}
        style={[styles.content, {padding: layout.cardPadding, minHeight}]}>
        {children}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {width: '100%', position: 'relative'},
  bgClip: {overflow: 'hidden'},
  content: {justifyContent: 'flex-end', flexShrink: 1, zIndex: 1},
});
