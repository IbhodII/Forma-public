import React, {useState} from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';

import {useDesignSystem} from '../useDesignSystem';

type Props = TextInputProps & {
  label?: string;
  hint?: string;
  error?: string;
};

export function AppInput({label, hint, error, style, editable = true, ...rest}: Props) {
  const {colors, radius, layout, typography, space, motion, shadows} = useDesignSystem();
  const [focused, setFocused] = useState(false);
  const hasError = Boolean(error);
  const disabled = editable === false;

  const borderColor = hasError
    ? colors.danger
    : focused
      ? colors.accent
      : colors.border;

  return (
    <View style={[styles.wrap, disabled && {opacity: motion.disabledOpacity}]}>
      {label ? (
        <Text style={[typography.label, styles.label, {color: colors.textMuted}]}>{label}</Text>
      ) : null}
      <TextInput
        editable={editable}
        placeholderTextColor={colors.textSecondary}
        onFocus={e => {
          setFocused(true);
          rest.onFocus?.(e);
        }}
        onBlur={e => {
          setFocused(false);
          rest.onBlur?.(e);
        }}
        style={[
          styles.input,
          typography.body,
          {
            color: colors.text,
            backgroundColor: colors.surface,
            borderColor,
            borderRadius: radius.md,
            minHeight: layout.inputMinHeight,
          },
          focused && !hasError && shadows.sm,
          style,
        ]}
        {...rest}
      />
      {error ? (
        <Text style={[typography.caption, {color: colors.danger, marginTop: space[1]}]}>{error}</Text>
      ) : hint ? (
        <Text
          style={[
            typography.caption,
            {color: colors.textSecondary, marginTop: space[1], lineHeight: 18},
          ]}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {width: '100%'},
  label: {marginBottom: 6},
  input: {
    borderWidth: StyleSheet.hairlineWidth + 0.5,
    paddingHorizontal: 14,
    paddingVertical: 10,
    width: '100%',
  },
});
