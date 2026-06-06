import React, {useEffect, useState} from 'react';
import {StyleSheet, Switch, View} from 'react-native';

import {createProduct, updateProduct} from '../../api/food';
import {AppButton, AppInput, AppSheet, AppText} from '../../design-system';
import type {FoodProduct} from '../../types/food';
import {calcMacroCalories, parseNum} from '../../utils/nutrition';

type Props = {
  visible: boolean;
  product: FoodProduct | null;
  onClose: () => void;
  onSaved: () => void;
};

export function CatalogProductSheet({visible, product, onClose, onSaved}: Props) {
  const [name, setName] = useState('');
  const [protein, setProtein] = useState('');
  const [fat, setFat] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fiber, setFiber] = useState('');
  const [autoKcal, setAutoKcal] = useState(true);
  const [calories, setCalories] = useState('');
  const [isAlcohol, setIsAlcohol] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) {
      return;
    }
    setError(null);
    if (product) {
      setName(product.name);
      setProtein(String(product.protein));
      setFat(String(product.fat));
      setCarbs(String(product.carbs));
      setFiber(String(product.fiber_g ?? 0));
      setCalories(String(product.calories));
      setAutoKcal(false);
      setIsAlcohol(product.is_alcohol);
    } else {
      setName('');
      setProtein('');
      setFat('');
      setCarbs('');
      setFiber('');
      setCalories('');
      setAutoKcal(true);
      setIsAlcohol(false);
    }
  }, [visible, product]);

  const p = parseNum(protein);
  const f = parseNum(fat);
  const c = parseNum(carbs);
  const kcal =
    autoKcal || !calories.trim() ? calcMacroCalories(p, f, c) : parseNum(calories);

  const handleSave = async () => {
    if (!name.trim()) {
      setError('Укажите название');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const body = {
        name: name.trim(),
        protein: p,
        fat: f,
        carbs: c,
        fiber_g: parseNum(fiber),
        is_alcohol: isAlcohol,
        ...(autoKcal ? {} : {calories: parseNum(calories)}),
      };
      if (product) {
        await updateProduct(product.id, body);
      } else {
        await createProduct(body);
      }
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppSheet
      visible={visible}
      title={product ? 'Редактировать продукт' : 'Новый продукт'}
      onClose={onClose}>
      <View style={styles.form}>
        <AppInput label="Название" value={name} onChangeText={setName} />
        <AppInput
          label="Белки / 100 г"
          value={protein}
          onChangeText={setProtein}
          keyboardType="decimal-pad"
        />
        <AppInput label="Жиры" value={fat} onChangeText={setFat} keyboardType="decimal-pad" />
        <AppInput label="Углеводы" value={carbs} onChangeText={setCarbs} keyboardType="decimal-pad" />
        <AppInput label="Клетчатка" value={fiber} onChangeText={setFiber} keyboardType="decimal-pad" />
        <View style={styles.row}>
          <AppText variant="body">Калории из БЖУ</AppText>
          <Switch value={autoKcal} onValueChange={setAutoKcal} />
        </View>
        {!autoKcal ? (
          <AppInput
            label="Калории"
            value={calories}
            onChangeText={setCalories}
            keyboardType="decimal-pad"
          />
        ) : (
          <AppText variant="caption" color="textSecondary">
            ≈ {kcal} ккал / 100 г
          </AppText>
        )}
        <View style={styles.row}>
          <AppText variant="body">Алкоголь</AppText>
          <Switch value={isAlcohol} onValueChange={setIsAlcohol} />
        </View>
        {error ? (
          <AppText variant="caption" color="danger">
            {error}
          </AppText>
        ) : null}
        <AppButton label="Сохранить" onPress={handleSave} loading={saving} fullWidth />
      </View>
    </AppSheet>
  );
}

const styles = StyleSheet.create({
  form: {gap: 12, paddingBottom: 16},
  row: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
});
