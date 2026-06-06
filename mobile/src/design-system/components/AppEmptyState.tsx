import React from 'react';

import {StyleSheet, View, type StyleProp, type ViewStyle} from 'react-native';

import Icon from 'react-native-vector-icons/Ionicons';



import {AppButton} from './AppButton';

import {AppText} from './AppText';

import {useDesignSystem} from '../useDesignSystem';



type Props = {

  icon?: string;

  title: string;

  message?: string;

  actionLabel?: string;

  onAction?: () => void;

  compact?: boolean;

  style?: StyleProp<ViewStyle>;

};



export function AppEmptyState({

  icon = 'leaf-outline',

  title,

  message,

  actionLabel,

  onAction,

  compact,

  style,

}: Props) {

  const {colors, radius, layout, space, iconSize} = useDesignSystem();



  return (

    <View

      style={[

        styles.wrap,

        compact ? styles.compact : {minHeight: layout.emptyMinHeight},

        style,

      ]}>

      <View

        style={[

          styles.iconWrap,

          {
            backgroundColor: colors.surfaceMuted,
            borderRadius: radius.xl,
            borderColor: colors.border,
            borderWidth: StyleSheet.hairlineWidth + 0.5,
          },

        ]}>

        <Icon name={icon} size={iconSize.lg} color={colors.accent} />

      </View>

      <AppText variant="title3" style={{marginTop: space[3], textAlign: 'center'}}>

        {title}

      </AppText>

      {message ? (

        <AppText

          variant="body"

          color="textSecondary"

          style={{marginTop: space[2], textAlign: 'center', maxWidth: 280, lineHeight: 22}}>

          {message}

        </AppText>

      ) : null}

      {actionLabel && onAction ? (

        <AppButton

          label={actionLabel}

          onPress={onAction}

          variant="soft"

          style={{marginTop: space[4]}}

        />

      ) : null}

    </View>

  );

}



const styles = StyleSheet.create({

  wrap: {

    alignItems: 'center',

    justifyContent: 'center',

    paddingVertical: 24,

    paddingHorizontal: 16,

  },

  compact: {paddingVertical: 16, minHeight: 96},

  iconWrap: {

    width: 52,

    height: 52,

    alignItems: 'center',

    justifyContent: 'center',

  },

});

