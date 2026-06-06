import React from 'react';

import {StyleSheet, View, type StyleProp, type ViewStyle} from 'react-native';



import {useDesignSystem} from '../useDesignSystem';

import {AppCard} from './AppCard';

import {AppText} from './AppText';



type Props = {

  title: string;

  children: React.ReactNode;

  style?: StyleProp<ViewStyle>;

};



/** Grouped settings block — replaces hardcoded #ddd cards. */

export function SettingsPanel({title, children, style}: Props) {

  const {layout, space} = useDesignSystem();



  return (

    <View style={[{gap: space[2]}, style]}>

      <AppText variant="title3">{title}</AppText>

      <AppCard variant="elevated" padding="md" style={styles.cardInner}>

        <View style={{gap: layout.stackGap}}>{children}</View>

      </AppCard>

    </View>

  );

}



const styles = StyleSheet.create({

  cardInner: {width: '100%'},

});

