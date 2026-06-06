import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';

import type {DailyState, DailyStateKind} from '../../home/dailyState';
import {AppHero} from '../../design-system/components/AppHero';
import {useDesignSystem} from '../../design-system/useDesignSystem';

const KIND_ICON: Record<DailyStateKind, string> = {
  cycle_focus: 'flower-outline',
  recovery_day: 'bed-outline',
  high_fatigue: 'pulse-outline',
  moderate_fatigue: 'cloud-outline',
  high_readiness: 'sunny-outline',
  good_recovery: 'leaf-outline',
  return_to_movement: 'walk-outline',
  building_momentum: 'trending-up-outline',
  getting_started: 'sparkles-outline',
};

type Props = {
  greeting: string;
  state: DailyState;
  recoveryFactors?: string[];
};

export function DailyStateCard({greeting, state, recoveryFactors = []}: Props) {
  const {colors, typography, heroText, space, radius, iconSize} = useDesignSystem();

  const accent =
    state.kind === 'high_readiness' || state.kind === 'building_momentum'
      ? colors.stateRecovery
      : state.kind === 'recovery_day' || state.kind === 'high_fatigue'
        ? colors.accentWarm
        : colors.accent;

  return (
    <AppHero compact>
      <Text style={[typography.bodyMedium, heroText.subtitle, styles.greeting]}>{greeting}</Text>
      <Text style={[typography.overline, heroText.overline, styles.brand]}>Forma · как вы сегодня</Text>

      <View style={styles.headRow}>
        <View style={styles.headCopy}>
          <Text style={[typography.display, heroText.title, styles.headline]} numberOfLines={2}>
            {state.headline}
          </Text>
          <Text style={[typography.caption, heroText.subtitle, styles.sub]} numberOfLines={1}>
            {state.subheadline}
          </Text>
        </View>
        <View style={[styles.iconWrap, {backgroundColor: colors.heroChipBg, borderRadius: radius.lg}]}>
          <Icon name={KIND_ICON[state.kind]} size={iconSize.xl} color={colors.heroText} />
        </View>
      </View>

      <Text style={[typography.body, heroText.body, styles.narrative]} numberOfLines={4}>
        {state.narrative}
      </Text>

      {recoveryFactors.length ? (
        <View style={{gap: space[1], marginTop: space[2]}}>
          {recoveryFactors.slice(0, 3).map(f => (
            <Text key={f} style={[typography.caption, heroText.subtitle]}>
              • {f}
            </Text>
          ))}
        </View>
      ) : null}

      <View style={[styles.signals, {gap: space[2]}]}>
        <Signal label="Готовность" value={state.readinessLabel} />
        <Signal label="Усталость" value={state.fatigueLabel} highlight={state.fatigue === 'elevated'} />
        <Signal label="Интенсивность" value={state.intensityLabel} accent={accent} />
      </View>
    </AppHero>
  );
}

function Signal({
  label,
  value,
  highlight,
  accent,
}: {
  label: string;
  value: string;
  highlight?: boolean;
  accent?: string;
}) {
  const {colors, heroText} = useDesignSystem();

  return (
    <View
      style={[
        signalStyles.wrap,
        {backgroundColor: colors.heroChipBg, borderColor: colors.heroTextMuted},
      ]}>
      <Text style={[signalStyles.label, heroText.muted]}>{label}</Text>
      <Text
        style={[
          signalStyles.value,
          {color: colors.heroTextSecondary},
          highlight && {color: colors.accentWarm},
          accent && {color: colors.heroText},
        ]}>
        {value}
      </Text>
    </View>
  );
}

const signalStyles = StyleSheet.create({
  wrap: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  label: {fontSize: 9, fontWeight: '600', letterSpacing: 0.4},
  value: {fontSize: 12, fontWeight: '700', marginTop: 3},
});

const styles = StyleSheet.create({
  greeting: {fontWeight: '600'},
  brand: {marginTop: 2, marginBottom: 6},
  headRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 10,
  },
  headCopy: {flex: 1, minWidth: 0},
  headline: {fontWeight: '800'},
  sub: {marginTop: 4},
  iconWrap: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  narrative: {
    marginBottom: 8,
  },
  signals: {flexDirection: 'row'},
});
