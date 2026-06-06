import React from 'react';

import {StyleSheet, Text, View} from 'react-native';

import Animated from 'react-native-reanimated';



import {haptics} from '../../haptics';

import {AppCard} from '../../design-system/components/AppCard';

import {useDesignSystem} from '../../design-system/useDesignSystem';

import {PressableScale} from '../../design-system/motion/PressableScale';



export type MetricCard = {

  id: string;

  label: string;

  value: string;

  delta?: string;

  deltaUp?: boolean;

  hint?: string;

  accent?: string;

};



type Props = {

  items: MetricCard[];

  activeId?: string;

  onSelect?: (id: string) => void;

};



export function MetricCarousel({items, activeId, onSelect}: Props) {

  const {colors, typography, space} = useDesignSystem();



  return (

    <Animated.ScrollView

      horizontal

      showsHorizontalScrollIndicator={false}

      decelerationRate="fast"

      scrollEventThrottle={16}

      contentContainerStyle={{gap: space[2], paddingVertical: space[1]}}>

      {items.map(item => {

        const active = item.id === activeId;

        const accent = item.accent ?? colors.accent;

        const card = (

          <AppCard

            variant="elevated"

            padding="md"

            noShadow={!active}

            animateEnter={false}

            style={[

              styles.metricCard,

              {

                minWidth: 112,

                backgroundColor: active ? colors.accentMuted : undefined,

                borderColor: active ? accent : undefined,

              },

            ]}>

            <Text style={[typography.label, {color: colors.textMuted}]}>{item.label}</Text>

            <Text style={[typography.title2, {color: colors.text, marginTop: space[1]}]} numberOfLines={1}>

              {item.value}

            </Text>

            {item.delta ? (

              <Text

                style={[

                  typography.caption,

                  {

                    color: item.deltaUp === false ? colors.danger : colors.success,

                    marginTop: space[1],

                    fontWeight: '600',

                  },

                ]}>

                {item.delta}

              </Text>

            ) : null}

            {item.hint ? (

              <Text style={[typography.caption, {color: colors.textMuted, marginTop: space[1]}]} numberOfLines={1}>

                {item.hint}

              </Text>

            ) : null}

          </AppCard>

        );

        if (!onSelect) {

          return <View key={item.id}>{card}</View>;

        }

        return (

          <PressableScale

            key={item.id}

            onPress={() => {

              if (item.id !== activeId) {

                haptics.tab();

              }

              onSelect(item.id);

            }}

            haptic={false}

            scaleTo={0.98}>

            {card}

          </PressableScale>

        );

      })}

    </Animated.ScrollView>

  );

}



const styles = StyleSheet.create({

  metricCard: {},

});

