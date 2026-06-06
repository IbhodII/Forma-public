import React, {useState} from 'react';
import {StyleSheet, Text, View} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import Animated, {FadeIn, FadeOut, LinearTransition} from 'react-native-reanimated';

import {useDesignSystem} from '../../design-system/useDesignSystem';
import {PressableScale} from '../../design-system/motion/PressableScale';
import {Card} from '../../ui/Card';

type Props = {
  title: string;
  subtitle?: string;
  icon?: string;
  badge?: string | number;
  defaultOpen?: boolean;
  children: React.ReactNode;
};

export function SettingsSection({
  title,
  subtitle,
  icon,
  badge,
  defaultOpen = false,
  children,
}: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const {colors, typography, radius, iconSize, space, layout} = useDesignSystem();

  return (
    <Card style={styles.section} animateEnter={false}>
      <PressableScale onPress={() => setOpen(v => !v)} scaleTo={0.995} spring="soft" style={[styles.header, {padding: space[3], gap: space[2], minHeight: layout.listItemMinHeight}]}>
        {icon ? (
          <View
            style={[
              styles.iconBox,
              {backgroundColor: colors.accentMuted, borderRadius: radius.sm},
            ]}>
            <Icon name={icon} size={iconSize.md} color={colors.accent} />
          </View>
        ) : null}
        <View style={styles.headerText}>
          <Text style={[typography.title2, {color: colors.text}]}>{title}</Text>
          {subtitle ? (
            <Text style={[styles.sub, {color: colors.textMuted}]}>{subtitle}</Text>
          ) : null}
        </View>
        {badge != null && Number(badge) > 0 ? (
          <View style={[styles.badge, {backgroundColor: colors.dangerMuted}]}>
            <Text style={[styles.badgeText, {color: colors.danger}]}>{badge}</Text>
          </View>
        ) : null}
        <Icon
          name={open ? 'chevron-up' : 'chevron-down'}
          size={22}
          color={colors.textMuted}
        />
      </PressableScale>
      {open ? (
        <Animated.View
          entering={FadeIn.duration(180)}
          exiting={FadeOut.duration(140)}
          layout={LinearTransition.springify().damping(24).stiffness(260)}
          style={[styles.body, {borderTopColor: colors.border, padding: space[3], paddingTop: space[2], gap: space[3]}]}>
          {children}
        </Animated.View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  section: {padding: 0, overflow: 'hidden'},
  header: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: {flex: 1, gap: 2},
  sub: {fontSize: 13},
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    marginRight: 4,
  },
  badgeText: {fontSize: 12, fontWeight: '700'},
  body: {
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
