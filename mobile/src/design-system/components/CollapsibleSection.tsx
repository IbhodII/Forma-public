import React, {useState, type ReactNode} from 'react';
import {StyleSheet, View} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';

import {AppText} from './AppText';
import {PressableScale} from '../motion/PressableScale';
import {useDesignSystem} from '../useDesignSystem';

type Props = {
  title: string;
  subtitle?: string;
  defaultOpen?: boolean;
  children: ReactNode;
};

export function CollapsibleSection({title, subtitle, defaultOpen = false, children}: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const {colors, space, radius, layout} = useDesignSystem();

  return (
    <View
      style={[
        styles.wrap,
        {
          borderColor: colors.border,
          borderRadius: radius.md,
          backgroundColor: colors.surfaceMuted,
        },
      ]}>
      <PressableScale
        onPress={() => setOpen(v => !v)}
        style={[styles.header, {paddingHorizontal: layout.cardPadding, paddingVertical: space[3]}]}>
        <View style={{flex: 1}}>
          <AppText variant="body" style={{fontWeight: '600'}}>
            {title}
          </AppText>
          {subtitle ? (
            <AppText variant="caption" color="textMuted">
              {subtitle}
            </AppText>
          ) : null}
        </View>
        <Icon name={open ? 'chevron-up' : 'chevron-down'} size={20} color={colors.textSecondary} />
      </PressableScale>
      {open ? (
        <View style={{paddingHorizontal: layout.cardPadding, paddingBottom: space[3]}}>
          {children}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
});
