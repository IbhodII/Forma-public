import React, {useEffect, useMemo, useState} from 'react';
import {
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query';

import {
  applyMealPlanToDay,
  createMealPlan,
  deleteMealPlan,
  fetchMealPlan,
  fetchMealPlans,
  fetchMealTemplate,
  fetchWeeklySchedule,
  saveWeeklySchedule,
  updateMealPlan,
  updateMealTemplate,
  getProducts,
  type MealPlanDetail,
  type MealPlanSummary,
  type WeeklyScheduleItem,
} from '../api/food';
import type {FoodPhase} from '../types/food';
import {useOffline} from '../context/OfflineContext';
import {AppButton} from '../design-system/components/AppButton';
import {AppCard} from '../design-system/components/AppCard';
import {AppInput} from '../design-system/components/AppInput';
import {AppEmptyState} from '../design-system/components/AppEmptyState';
import {AppLoadingState} from '../design-system/components/AppLoadingState';
import {AppTabs} from '../design-system/components/AppTabs';
import {AppText} from '../design-system/components/AppText';
import {useDesignSystem} from '../design-system/useDesignSystem';
import {addDaysIso, getWeekStart} from '../utils/formaWeek';

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'] as const;
const WEEKDAY_FULL = [
  'Понедельник',
  'Вторник',
  'Среда',
  'Четверг',
  'Пятница',
  'Суббота',
  'Воскресенье',
] as const;

type PanelTab = 'schedule' | 'plans';

type ItemDraft = {productId: number; productName: string; quantity: string};
type MealDraft = {mealType: string; templateId?: number; items: ItemDraft[]};

function ScheduleSection({anchorDate}: {anchorDate: string}) {
  const qc = useQueryClient();
  const {layout, space} = useDesignSystem();
  const weekStart = useMemo(() => getWeekStart(anchorDate), [anchorDate]);
  const [draft, setDraft] = useState<Array<{day_of_week: number; meal_plan_id: number | ''}> | null>(
    null,
  );

  const plansQuery = useQuery({queryKey: ['food-meal-plans'], queryFn: fetchMealPlans});
  const scheduleQuery = useQuery({
    queryKey: ['food-weekly-schedule'],
    queryFn: fetchWeeklySchedule,
  });

  useEffect(() => {
    if (scheduleQuery.data && draft === null) {
      setDraft(
        WEEKDAYS.map((_, dow) => {
          const row = scheduleQuery.data!.find((s: WeeklyScheduleItem) => s.day_of_week === dow);
          return {day_of_week: dow, meal_plan_id: row?.meal_plan_id ?? ''};
        }),
      );
    }
  }, [scheduleQuery.data, draft]);

  const saveMut = useMutation({
    mutationFn: () =>
      saveWeeklySchedule(
        (draft ?? []).map(d => ({
          day_of_week: d.day_of_week,
          meal_plan_id: d.meal_plan_id === '' ? null : Number(d.meal_plan_id),
        })),
      ),
    onSuccess: () => {
      void qc.invalidateQueries({queryKey: ['food-weekly-schedule']});
      Alert.alert('Готово', 'Расписание сохранено');
    },
    onError: (e: Error) => Alert.alert('Ошибка', e.message),
  });

  const applyMut = useMutation({
    mutationFn: async () => {
      const rows = draft ?? [];
      const plans = plansQuery.data ?? [];
      let total = 0;
      for (const row of rows) {
        if (row.meal_plan_id === '') continue;
        const plan = plans.find((p: MealPlanSummary) => p.id === row.meal_plan_id);
        if (!plan) continue;
        const res = await applyMealPlanToDay({
          plan_id: Number(row.meal_plan_id),
          date: addDaysIso(weekStart, row.day_of_week),
          phase: plan.phase,
        });
        total += res.total_added;
      }
      return total;
    },
    onSuccess: total => {
      void qc.invalidateQueries({queryKey: ['food-week']});
      Alert.alert('Готово', `Добавлено позиций: ${total}`);
    },
    onError: (e: Error) => Alert.alert('Ошибка', e.message),
  });

  if (plansQuery.isLoading || scheduleQuery.isLoading) {
    return <AppLoadingState compact />;
  }

  const rows = draft ?? [];
  const plans = plansQuery.data ?? [];

  return (
    <View style={{gap: layout.blockGap}}>
      <AppText variant="caption" color="muted">
        Назначьте рацион на каждый день. Применение заполнит неделю с {weekStart} по{' '}
        {addDaysIso(weekStart, 6)}.
      </AppText>
      {rows.map(row => (
        <View key={row.day_of_week} style={{gap: space[1]}}>
          <AppText variant="caption">{WEEKDAY_FULL[row.day_of_week]}</AppText>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.chipRow}>
              <AppButton
                label="—"
                size="sm"
                variant={row.meal_plan_id === '' ? 'primary' : 'secondary'}
                onPress={() =>
                  setDraft(prev =>
                    (prev ?? rows).map(d =>
                      d.day_of_week === row.day_of_week
                        ? {...d, meal_plan_id: ''}
                        : d,
                    ),
                  )
                }
              />
              {plans.map((p: MealPlanSummary) => (
                <AppButton
                  key={p.id}
                  label={p.name.length > 14 ? `${p.name.slice(0, 12)}…` : p.name}
                  size="sm"
                  variant={row.meal_plan_id === p.id ? 'primary' : 'secondary'}
                  onPress={() =>
                    setDraft(prev =>
                      (prev ?? rows).map(d =>
                        d.day_of_week === row.day_of_week
                          ? {...d, meal_plan_id: p.id}
                          : d,
                      ),
                    )
                  }
                />
              ))}
            </View>
          </ScrollView>
        </View>
      ))}
      <AppButton
        label="Сохранить расписание"
        onPress={() => saveMut.mutate()}
        loading={saveMut.isPending}
        fullWidth
      />
      <AppButton
        label="Применить на неделю"
        variant="secondary"
        onPress={() =>
          Alert.alert('Применить расписание?', 'Заменить записи в дневнике за эту неделю?', [
            {text: 'Отмена', style: 'cancel'},
            {text: 'Применить', onPress: () => applyMut.mutate()},
          ])
        }
        loading={applyMut.isPending}
        fullWidth
      />
    </View>
  );
}

function PlanEditorModal({
  visible,
  title,
  meals,
  onClose,
  onSave,
  saving,
}: {
  visible: boolean;
  title: string;
  meals: MealDraft[];
  onClose: () => void;
  onSave: (meals: MealDraft[]) => void;
  saving: boolean;
}) {
  const {colors, space} = useDesignSystem();
  const [local, setLocal] = useState(meals);
  const productsQuery = useQuery({queryKey: ['food-products'], queryFn: () => getProducts()});

  useEffect(() => {
    if (visible) setLocal(meals);
  }, [visible, meals]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.modalRoot, {backgroundColor: colors.bg}]}>
        <AppText variant="title2">{title}</AppText>
        <ScrollView style={{flex: 1, marginTop: space[3]}}>
          {local.map((meal, mi) => (
            <AppCard key={mi} variant="elevated" animateEnter={false} style={{marginBottom: space[3]}}>
              <AppText variant="caption" color="muted">
                {meal.templateId ? `Шаблон · ${meal.mealType}` : meal.mealType}
              </AppText>
              {meal.items.map((item, ii) => (
                <View key={ii} style={{gap: space[2], marginTop: space[2]}}>
                  <AppInput
                    placeholder="Продукт"
                    value={item.productName}
                    onChangeText={v => {
                      const next = [...local];
                      const items = [...next[mi].items];
                      items[ii] = {...items[ii], productName: v};
                      const exact = (productsQuery.data ?? []).find(
                        (p: {id: number; name: string}) =>
                          p.name.toLowerCase() === v.trim().toLowerCase(),
                      );
                      if (exact) items[ii] = {...items[ii], productId: exact.id, productName: exact.name};
                      next[mi] = {...next[mi], items};
                      setLocal(next);
                    }}
                  />
                  <AppInput
                    placeholder="Граммы"
                    keyboardType="numeric"
                    value={item.quantity}
                    onChangeText={v => {
                      const next = [...local];
                      const items = [...next[mi].items];
                      items[ii] = {...items[ii], quantity: v};
                      next[mi] = {...next[mi], items};
                      setLocal(next);
                    }}
                  />
                </View>
              ))}
              <AppButton
                label="+ Продукт"
                size="sm"
                variant="secondary"
                onPress={() => {
                  const next = [...local];
                  next[mi] = {
                    ...next[mi],
                    items: [...next[mi].items, {productId: 0, productName: '', quantity: '100'}],
                  };
                  setLocal(next);
                }}
              />
            </AppCard>
          ))}
        </ScrollView>
        <View style={{flexDirection: 'row', gap: space[2], marginTop: space[3]}}>
          <AppButton label="Отмена" variant="secondary" onPress={onClose} style={{flex: 1}} />
          <AppButton
            label="Сохранить"
            onPress={() => onSave(local)}
            loading={saving}
            style={{flex: 1}}
          />
        </View>
      </View>
    </Modal>
  );
}

function isTemplateBasedDetail(detail: MealPlanDetail): boolean {
  if (detail.uses_templates) return true;
  return (
    (detail.templates?.length ?? 0) > 0 &&
    !(detail.days ?? []).some(d => (d.meals?.length ?? 0) > 0)
  );
}

function planTypeLabel(plan: MealPlanSummary): string {
  if (plan.uses_templates) return 'Шаблоны';
  if (plan.is_weekly) return 'Неделя';
  return 'День';
}

function PlansListSection({anchorDate}: {anchorDate: string}) {
  const qc = useQueryClient();
  const {layout, space} = useDesignSystem();
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorTitle, setEditorTitle] = useState('');
  const [editorMeals, setEditorMeals] = useState<MealDraft[]>([]);
  const [editingPlanId, setEditingPlanId] = useState<number | null>(null);
  const [editingTemplateBased, setEditingTemplateBased] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhase, setNewPhase] = useState<FoodPhase>('cut');
  const plansQuery = useQuery({queryKey: ['food-meal-plans'], queryFn: fetchMealPlans});
  const plans = plansQuery.data ?? [];

  const openTemplateEditor = async (plan: MealPlanSummary, detail: MealPlanDetail) => {
    const sorted = [...(detail.templates ?? [])].sort((a, b) => a.sort_order - b.sort_order);
    const meals: MealDraft[] = [];
    for (const ref of sorted) {
      const tpl = await fetchMealTemplate(ref.template_id);
      meals.push({
        mealType: tpl.meal_type,
        templateId: ref.template_id,
        items: tpl.items.map(it => ({
          productId: it.product_id,
          productName: it.product_name,
          quantity: String(it.quantity),
        })),
      });
    }
    setEditingPlanId(plan.id);
    setEditingTemplateBased(true);
    setEditorTitle(plan.name);
    setEditorMeals(meals);
    setEditorOpen(true);
  };

  const openItemEditor = async (plan: MealPlanSummary, detail: MealPlanDetail) => {
    const day = detail.days?.[0];
    setEditingPlanId(plan.id);
    setEditingTemplateBased(false);
    setEditorTitle(plan.name);
    setEditorMeals(
      (day?.meals ?? []).map(m => ({
        mealType: m.meal_type,
        items: (m.items ?? []).map(it => ({
          productId: it.product_id,
          productName: it.product_name ?? '',
          quantity: String(it.quantity),
        })),
      })),
    );
    setEditorOpen(true);
  };

  const openEdit = async (plan: MealPlanSummary) => {
    try {
      const detail = await fetchMealPlan(plan.id);
      if (isTemplateBasedDetail(detail)) {
        await openTemplateEditor(plan, detail);
      } else {
        await openItemEditor(plan, detail);
      }
    } catch (e) {
      Alert.alert('Ошибка', e instanceof Error ? e.message : 'Не удалось открыть рацион');
    }
  };

  const saveMut = useMutation({
    mutationFn: async (meals: MealDraft[]) => {
      if (editingTemplateBased && editingPlanId) {
        for (const meal of meals) {
          if (!meal.templateId) continue;
          const items = meal.items
            .filter(it => it.productId > 0)
            .map(it => ({
              product_id: it.productId,
              quantity: parseFloat(it.quantity.replace(',', '.')),
            }))
            .filter(it => Number.isFinite(it.quantity) && it.quantity > 0);
          if (items.length) await updateMealTemplate(meal.templateId, {items});
        }
        return;
      }
      const days = [
        {
          day_offset: 0,
          meals: meals
            .map(m => ({
              meal_type: m.mealType,
              items: m.items
                .filter(it => it.productId > 0)
                .map(it => ({
                  product_id: it.productId,
                  quantity: parseFloat(it.quantity.replace(',', '.')),
                }))
                .filter(it => Number.isFinite(it.quantity) && it.quantity > 0),
            }))
            .filter(m => m.items.length > 0),
        },
      ];
      if (!days[0].meals.length) throw new Error('Добавьте продукты');
      if (editingPlanId) {
        await updateMealPlan(editingPlanId, {
          name: editorTitle,
          phase: newPhase,
          days,
        });
      } else {
        await createMealPlan({name: newName.trim(), phase: newPhase, days});
      }
    },
    onSuccess: () => {
      setEditorOpen(false);
      void qc.invalidateQueries({queryKey: ['food-meal-plans']});
      Alert.alert('Готово', 'Сохранено');
    },
    onError: (e: Error) => Alert.alert('Ошибка', e.message),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => deleteMealPlan(id),
    onSuccess: () => void qc.invalidateQueries({queryKey: ['food-meal-plans']}),
    onError: (e: Error) => Alert.alert('Ошибка', e.message),
  });

  const applyMut = useMutation({
    mutationFn: (plan: MealPlanSummary) =>
      applyMealPlanToDay({
        plan_id: plan.id,
        date: anchorDate,
        phase: plan.phase,
      }),
    onSuccess: res => {
      void qc.invalidateQueries({queryKey: ['food-week']});
      Alert.alert('Готово', `Добавлено позиций: ${res.total_added}`);
    },
    onError: (e: Error) => Alert.alert('Ошибка', e.message),
  });

  if (plansQuery.isLoading) return <AppLoadingState compact />;

  return (
    <View style={{gap: layout.blockGap}}>
      <View style={{gap: space[2]}}>
        <AppInput
          placeholder="Название нового рациона"
          value={newName}
          onChangeText={setNewName}
        />
        <View style={styles.chipRow}>
          {(['cut', 'bulk'] as FoodPhase[]).map(p => (
            <AppButton
              key={p}
              label={p === 'cut' ? 'Сушка' : 'Набор'}
              size="sm"
              variant={newPhase === p ? 'primary' : 'secondary'}
              onPress={() => setNewPhase(p)}
            />
          ))}
        </View>
        <AppButton
          label="Создать рацион"
          onPress={() => {
            if (!newName.trim()) {
              Alert.alert('Укажите название');
              return;
            }
            setEditingPlanId(null);
            setEditingTemplateBased(false);
            setEditorTitle(newName.trim());
            setEditorMeals([{mealType: 'breakfast1', items: [{productId: 0, productName: '', quantity: '100'}]}]);
            setEditorOpen(true);
          }}
        />
      </View>
      {plans.length === 0 ? (
        <AppEmptyState icon="restaurant-outline" title="Нет рационов" compact />
      ) : (
        plans.map((plan: MealPlanSummary) => (
          <AppCard key={plan.id} variant="elevated" animateEnter={false}>
            <AppText variant="title3">{plan.name}</AppText>
            <AppText variant="caption" color="muted">
              {plan.phase === 'cut' ? 'Сушка' : 'Набор'} · {planTypeLabel(plan)} · {plan.meals_count ?? 0} приёмов
            </AppText>
            <View style={[styles.chipRow, {marginTop: space[2]}]}>
              <AppButton
                label="Применить"
                size="sm"
                variant="secondary"
                loading={applyMut.isPending}
                onPress={() => applyMut.mutate(plan)}
              />
              <AppButton
                label="Редактировать"
                size="sm"
                variant="secondary"
                onPress={() => void openEdit(plan)}
              />
              <AppButton
                label="Удалить"
                size="sm"
                variant="secondary"
                onPress={() =>
                  Alert.alert('Удалить?', plan.name, [
                    {text: 'Отмена', style: 'cancel'},
                    {text: 'Удалить', style: 'destructive', onPress: () => deleteMut.mutate(plan.id)},
                  ])
                }
              />
            </View>
          </AppCard>
        ))
      )}
      <PlanEditorModal
        visible={editorOpen}
        title={editorTitle}
        meals={editorMeals}
        saving={saveMut.isPending}
        onClose={() => setEditorOpen(false)}
        onSave={meals => saveMut.mutate(meals)}
      />
    </View>
  );
}

type Props = {anchorDate: string};

export function FoodPlansPanel({anchorDate}: Props) {
  const {isOnline} = useOffline();
  const {colors, layout} = useDesignSystem();
  const [panelTab, setPanelTab] = useState<PanelTab>('schedule');

  if (!isOnline) {
    return (
      <View style={[styles.hint, {backgroundColor: colors.warningMuted}]}>
        <AppText variant="caption" color="warning">
          Рационы и расписание доступны только онлайн
        </AppText>
      </View>
    );
  }

  return (
    <View style={{flex: 1, gap: layout.blockGap}}>
      <AppTabs
        options={['Расписание', 'Рационы'] as const}
        value={panelTab === 'schedule' ? 'Расписание' : 'Рационы'}
        onChange={v => setPanelTab(v === 'Расписание' ? 'schedule' : 'plans')}
      />
      {panelTab === 'schedule' ? (
        <ScheduleSection anchorDate={anchorDate} />
      ) : (
        <PlansListSection anchorDate={anchorDate} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  hint: {padding: 12, borderRadius: 12},
  chipRow: {flexDirection: 'row', flexWrap: 'wrap', gap: 8},
  modalRoot: {flex: 1, padding: 16, paddingTop: 48},
});
