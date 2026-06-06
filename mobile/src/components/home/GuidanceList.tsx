import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';

import type {GuidanceCard, GuidanceTone} from '../../home/guidance';
import {haptics} from '../../haptics';
import {useDesignSystem} from '../../design-system/useDesignSystem';
import {PressableScale} from '../../design-system/motion/PressableScale';
import {StaggerItem} from '../../design-system/motion/Stagger';

type Props = {
  cards: GuidanceCard[];
  onOpen: (tab: string) => void;
};

const TONE_BG: Record<GuidanceTone, (c: ReturnType<typeof useDesignSystem>['colors']) => string> = {
  calm: c => c.stateRecoveryMuted,
  warm: c => c.stateWellnessMuted,
  alert: c => c.warningMuted,
  celebrate: c => c.accentMuted,
};

const TONE_FG: Record<GuidanceTone, (c: ReturnType<typeof useDesignSystem>['colors']) => string> = {
  calm: c => c.stateRecovery,
  warm: c => c.accentWarm,
  alert: c => c.warning,
  celebrate: c => c.accent,
};

export function GuidanceList({cards, onOpen}: Props) {
  const {colors, typography, radius, layout, iconSize, space} = useDesignSystem();

  return (
    <View style={{gap: space[2], paddingHorizontal: layout.screenPaddingX}}>
      <Text style={[typography.overline, {color: colors.textMuted}]}>Для вас сегодня</Text>
      {cards.map((card, index) => (
        <StaggerItem key={card.id} index={index}>
          <PressableScale
            onPress={() => {
              haptics.selection();
              onOpen(card.tab);
            }}
            haptic={false}
            scaleTo={0.995}
            spring="soft">
            <View
              style={[
                styles.row,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                  borderRadius: radius.md,
                },
              ]}>
              <View
                style={[
                  styles.icon,
                  {
                    backgroundColor: TONE_BG[card.tone](colors),
                    borderRadius: radius.sm,
                  },
                ]}>
                <Icon name={card.icon} size={iconSize.md} color={TONE_FG[card.tone](colors)} />
              </View>
              <View style={styles.body}>
                <Text style={[typography.title3, {color: colors.text}]}>{card.title}</Text>
                <Text
                  style={[typography.caption, {color: colors.textSecondary, marginTop: 3, lineHeight: 17}]}>
                  {card.body}
                </Text>
              </View>
              <Icon name="chevron-forward" size={iconSize.sm} color={colors.textMuted} />
            </View>
          </PressableScale>
        </StaggerItem>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: 12,
    borderWidth: 1,
  },
  icon: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {flex: 1, minWidth: 0, paddingTop: 2},
});
