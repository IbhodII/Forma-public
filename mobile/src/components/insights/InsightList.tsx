import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';

import type {Insight, InsightTone} from '../../insights';
import {haptics} from '../../haptics';
import {useDesignSystem} from '../../design-system/useDesignSystem';
import {PressableScale} from '../../design-system/motion/PressableScale';
import {StaggerItem} from '../../design-system/motion/Stagger';

type Props = {
  insights: Insight[];
  title?: string;
  onOpen?: (tab: string) => void;
  compact?: boolean;
};

const TONE_BG: Record<InsightTone, (c: ReturnType<typeof useDesignSystem>['colors']) => string> = {
  calm: c => c.stateRecoveryMuted,
  warm: c => c.stateWellnessMuted,
  alert: c => c.warningMuted,
  positive: c => c.accentMuted,
  neutral: c => c.surfaceMuted,
};

const TONE_FG: Record<InsightTone, (c: ReturnType<typeof useDesignSystem>['colors']) => string> = {
  calm: c => c.stateRecovery,
  warm: c => c.accentWarm,
  alert: c => c.warning,
  positive: c => c.accent,
  neutral: c => c.textSecondary,
};

const DEFAULT_ICON: Record<InsightTone, string> = {
  calm: 'leaf-outline',
  warm: 'partly-sunny-outline',
  alert: 'alert-circle-outline',
  positive: 'checkmark-circle-outline',
  neutral: 'information-circle-outline',
};

export function InsightList({insights, title = 'Понимание состояния', onOpen, compact}: Props) {
  const {colors, typography, radius, layout, iconSize, space} = useDesignSystem();

  if (insights.length === 0) {
    return null;
  }

  return (
    <View style={{gap: space[2]}}>
      <Text style={[typography.overline, {color: colors.textMuted}]}>{title}</Text>
      {insights.map((insight, index) => {
        const icon = insight.icon ?? DEFAULT_ICON[insight.tone];
        const pressable = Boolean(onOpen && insight.tab);

        const row = (
          <View
            style={[
              compact ? styles.rowCompact : styles.row,
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
                  backgroundColor: TONE_BG[insight.tone](colors),
                  borderRadius: radius.sm,
                },
              ]}>
              <Icon name={icon} size={iconSize.md} color={TONE_FG[insight.tone](colors)} />
            </View>
            <View style={styles.body}>
              <Text style={[typography.title3, {color: colors.text}]}>{insight.title}</Text>
              <Text
                style={[
                  typography.caption,
                  {color: colors.textSecondary, marginTop: 3, lineHeight: 17},
                ]}>
                {insight.body}
              </Text>
            </View>
            {pressable ? (
              <Icon name="chevron-forward" size={iconSize.sm} color={colors.textMuted} />
            ) : null}
          </View>
        );

        return (
          <StaggerItem key={insight.id} index={index}>
            {pressable ? (
              <PressableScale
                onPress={() => {
                  haptics.selection();
                  onOpen!(insight.tab!);
                }}
                haptic={false}
                scaleTo={0.995}
                spring="soft">
                {row}
              </PressableScale>
            ) : (
              row
            )}
          </StaggerItem>
        );
      })}
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
  rowCompact: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 11,
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
