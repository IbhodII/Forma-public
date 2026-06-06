import React from 'react';

import {StyleSheet, Text, View, type StyleProp, type ViewStyle} from 'react-native';



import {useDesignSystem} from '../useDesignSystem';

import {PressableScale} from '../motion/PressableScale';



type Props = {

  title: string;

  subtitle?: string;

  actionLabel?: string;

  onAction?: () => void;

  children?: React.ReactNode;

  style?: StyleProp<ViewStyle>;

  first?: boolean;

  /** Section spans edge-to-edge (e.g. horizontal carousel) */

  bleed?: boolean;

};



export function AppSection({

  title,

  subtitle,

  actionLabel,

  onAction,

  children,

  style,

  first,

  bleed,

}: Props) {

  const {colors, typography, layout, space} = useDesignSystem();



  return (

    <View

      style={[

        styles.section,

        {

          marginTop: first ? space[1] : layout.sectionGap,

          gap: layout.stackGap,

          paddingHorizontal: bleed ? 0 : layout.screenPaddingX,

        },

        style,

      ]}>

      <View style={[styles.head, bleed && {paddingHorizontal: layout.screenPaddingX}]}>

        <View style={styles.titles}>

          <Text style={[typography.overline, {color: colors.textSecondary}]}>{title}</Text>

          {subtitle ? (

            <Text style={[typography.title3, {color: colors.text, marginTop: space[1]}]}>

              {subtitle}

            </Text>

          ) : null}

        </View>

        {actionLabel && onAction ? (

          <PressableScale onPress={onAction} scaleTo={0.96} spring="snappy" hitSlop={layout.iconHitSlop}>

            <Text style={[typography.caption, {color: colors.accent, fontWeight: '700'}]}>

              {actionLabel}

            </Text>

          </PressableScale>

        ) : null}

      </View>

      {children}

    </View>

  );

}



const styles = StyleSheet.create({

  section: {},

  head: {flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12},

  titles: {flex: 1},

});


