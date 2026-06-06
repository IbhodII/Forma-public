import React, {useEffect, useState} from 'react';
import {ActivityIndicator, Pressable, StyleSheet, Text, View} from 'react-native';

import {useDesignSystem} from '../design-system/useDesignSystem';

type Props = {
  isLoading: boolean;
  isError?: boolean;
  error?: unknown;
  isEmpty?: boolean;
  onRetry?: () => void;
  emptyMessage?: string;
  loadingLabel?: string;
  errorMessage?: string;
  timeoutMs?: number;
  children: React.ReactNode;
};

function errorText(err: unknown, fallback: string): string {
  if (typeof err === 'string') return err;
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

export function DataStateShell({
  isLoading,
  isError = false,
  error,
  isEmpty = false,
  onRetry,
  emptyMessage = 'Данных пока нет',
  loadingLabel = 'Загрузка…',
  errorMessage = 'Не удалось загрузить данные',
  timeoutMs = 20_000,
  children,
}: Props) {
  const {colors, typography} = useDesignSystem();
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    if (!isLoading || !timeoutMs) {
      setTimedOut(false);
      return;
    }
    const timer = setTimeout(() => setTimedOut(true), timeoutMs);
    return () => clearTimeout(timer);
  }, [isLoading, timeoutMs]);

  const showError = isError || timedOut;
  const showLoading = isLoading && !showError;
  const showEmpty = !showLoading && !showError && isEmpty;

  if (showLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.accent} />
        <Text style={[typography.caption, styles.hint, {color: colors.textMuted}]}>
          {loadingLabel}
        </Text>
      </View>
    );
  }

  if (showError) {
    const msg = timedOut
      ? 'Загрузка заняла слишком много времени. Проверьте подключение или повторите.'
      : errorText(error, errorMessage);
    return (
      <View style={styles.centered}>
        <Text style={[typography.body, styles.msg, {color: colors.text}]}>{msg}</Text>
        {onRetry ? (
          <Pressable onPress={onRetry} style={[styles.retryBtn, {borderColor: colors.accent}]}>
            <Text style={{color: colors.accent}}>Повторить</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }

  if (showEmpty) {
    return (
      <View style={styles.centered}>
        <Text style={[typography.body, styles.msg, {color: colors.textMuted}]}>{emptyMessage}</Text>
      </View>
    );
  }

  return <>{children}</>;
}

const styles = StyleSheet.create({
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 24,
    paddingHorizontal: 16,
    gap: 12,
  },
  hint: {marginTop: 8, textAlign: 'center'},
  msg: {textAlign: 'center'},
  retryBtn: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
});
