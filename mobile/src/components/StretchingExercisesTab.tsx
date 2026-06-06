import React, {useMemo, useState} from 'react';
import {ActivityIndicator, Image, ScrollView, StyleSheet, View} from 'react-native';
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query';

import {fetchStretchingExercises, updateStretchingExercise} from '../api/stretching';
import type {StretchingExercise} from '../types/stretching';
import {AppButton, AppCard, AppInput, AppSheet, AppText} from '../design-system';
import {useDesignSystem} from '../design-system/useDesignSystem';
import {useFlexTabListBottomPad} from '../layout/screenContent';

function imageUrl(path: string | undefined | null): string | null {
  if (!path) {
    return null;
  }
  if (/^https?:\/\//i.test(path)) {
    return path;
  }
  return `https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/${path}`;
}

export function StretchingExercisesTab() {
  const {colors, radius, layout} = useDesignSystem();
  const listBottomPad = useFlexTabListBottomPad();
  const queryClient = useQueryClient();
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<StretchingExercise | null>(null);
  const [name, setName] = useState('');
  const [targetGroup, setTargetGroup] = useState('');
  const [description, setDescription] = useState('');

  const exercisesQuery = useQuery({
    queryKey: ['stretching-exercises'],
    queryFn: () => fetchStretchingExercises(),
  });

  const filtered = useMemo(() => {
    const all = exercisesQuery.data || [];
    const q = query.trim().toLowerCase();
    if (!q) {
      return all;
    }
    return all.filter(
      (e: StretchingExercise) =>
        e.name.toLowerCase().includes(q) || (e.original_name || '').toLowerCase().includes(q),
    );
  }, [exercisesQuery.data, query]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!editing) {
        return null;
      }
      return updateStretchingExercise(editing.id, {
        name: name.trim(),
        target_muscle_group: targetGroup.trim() || null,
        description: description.trim() || null,
        images: editing.images_json || [],
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({queryKey: ['stretching-exercises']});
      setEditing(null);
    },
  });

  return (
    <View style={[styles.root, {gap: layout.blockGap}]}>
      <AppInput placeholder="Поиск по названию" value={query} onChangeText={setQuery} />

      {exercisesQuery.isLoading && <ActivityIndicator color={colors.accent} />}

      <ScrollView
        style={styles.flexScroll}
        contentContainerStyle={[styles.list, {paddingBottom: listBottomPad}]}>
        {filtered.map((item: StretchingExercise) => {
          const firstImage = imageUrl(item.images_json?.[0]);
          return (
            <AppCard
              key={item.id}
              padding="md"
              style={styles.card}
              onPress={() => {
                setEditing(item);
                setName(item.name || '');
                setTargetGroup(item.target_muscle_group || '');
                setDescription(item.description || '');
              }}>
              <View style={styles.cardTop}>
                <View style={{flex: 1}}>
                  <AppText variant="title3">{item.name}</AppText>
                  {!!item.original_name && (
                    <AppText variant="caption" color="textMuted">
                      Оригинал: {item.original_name}
                    </AppText>
                  )}
                </View>
                {firstImage ? (
                  <Image source={{uri: firstImage}} style={[styles.thumb, {borderRadius: radius.sm}]} />
                ) : (
                  <View
                    style={[
                      styles.thumb,
                      styles.thumbPlaceholder,
                      {borderRadius: radius.sm, backgroundColor: colors.surfaceMuted},
                    ]}>
                    <AppText variant="caption" color="textMuted">
                      Нет
                    </AppText>
                  </View>
                )}
              </View>
            </AppCard>
          );
        })}
      </ScrollView>

      <AppSheet
        visible={Boolean(editing)}
        title="Редактирование упражнения"
        onClose={() => setEditing(null)}
        scroll>
        <AppText variant="caption" color="textMuted">
          Original: {editing?.original_name || '—'}
        </AppText>
        <AppInput value={name} onChangeText={setName} placeholder="Название (RU)" />
        <AppInput value={targetGroup} onChangeText={setTargetGroup} placeholder="target_muscle_group" />
        <AppInput
          value={description}
          onChangeText={setDescription}
          placeholder="Описание"
          multiline
          style={styles.area}
        />
        <AppText variant="caption" color="textMuted">
          Original description: {editing?.original_description || '—'}
        </AppText>
        <View style={styles.footer}>
          <AppButton label="Отмена" variant="secondary" onPress={() => setEditing(null)} />
          <AppButton
            label={saveMutation.isPending ? 'Сохранение…' : 'Сохранить'}
            onPress={() => saveMutation.mutate()}
            loading={saveMutation.isPending}
          />
        </View>
      </AppSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, minHeight: 0},
  flexScroll: {flex: 1},
  list: {gap: 8},
  card: {marginBottom: 0},
  cardTop: {flexDirection: 'row', gap: 10},
  thumb: {width: 64, height: 64},
  thumbPlaceholder: {justifyContent: 'center', alignItems: 'center'},
  area: {minHeight: 120, textAlignVertical: 'top'},
  footer: {flexDirection: 'row', justifyContent: 'space-between', gap: 8},
});
