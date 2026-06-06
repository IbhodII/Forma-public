import React, {useEffect, useState} from 'react';
import {Alert, StyleSheet, View} from 'react-native';
import {useQuery} from '@tanstack/react-query';

import {
  createCompositeProduct,
  getProduct,
  getProducts,
  updateCompositeProduct,
  type FoodCompositePayload,
} from '../../api/food';
import {AppButton, AppChip, AppInput, AppSheet, AppText} from '../../design-system';
import type {FoodProduct} from '../../types/food';

type ComponentRow = {productId: string; quantityG: string};

type Props = {
  visible: boolean;
  editProduct: FoodProduct | null;
  onClose: () => void;
  onSaved: () => void;
};

export function CompositeProductSheet({visible, editProduct, onClose, onSaved}: Props) {
  const [name, setName] = useState('');
  const [rows, setRows] = useState<ComponentRow[]>([{productId: '', quantityG: '100'}]);
  const [saving, setSaving] = useState(false);

  const productsQuery = useQuery({
    queryKey: ['food-products-simple'],
    queryFn: () => getProducts(),
    enabled: visible,
  });

  const simpleProducts = (productsQuery.data || []).filter((p: FoodProduct) => !p.is_composite);

  useEffect(() => {
    if (!visible) {
      return;
    }
    if (!editProduct) {
      setName('');
      setRows([{productId: '', quantityG: '100'}]);
      return;
    }
    setName(editProduct.name);
    void getProduct(editProduct.id, true)
      .then(detail => {
        const comps = detail.components || [];
        if (comps.length) {
          setRows(
            comps.map(c => ({
              productId: String(c.product_id),
              quantityG: String(c.quantity_g),
            })),
          );
        }
      })
      .catch(() => {
        setRows([{productId: '', quantityG: '100'}]);
      });
  }, [visible, editProduct]);

  const addRow = () => setRows(r => [...r, {productId: '', quantityG: '50'}]);

  const save = async () => {
    if (!name.trim()) {
      Alert.alert('Укажите название блюда');
      return;
    }
    const components = rows
      .map(r => ({
        product_id: Number(r.productId),
        quantity_g: Number(r.quantityG) || 0,
      }))
      .filter(c => c.product_id > 0 && c.quantity_g > 0);
    if (!components.length) {
      Alert.alert('Добавьте хотя бы один компонент');
      return;
    }
    const body: FoodCompositePayload = {name: name.trim(), components};
    setSaving(true);
    try {
      if (editProduct) {
        await updateCompositeProduct(editProduct.id, body);
      } else {
        await createCompositeProduct(body);
      }
      onSaved();
      onClose();
    } catch (e) {
      Alert.alert('Ошибка', e instanceof Error ? e.message : 'Не удалось сохранить');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppSheet
      visible={visible}
      title={editProduct ? 'Составное блюдо' : 'Новое составное блюдо'}
      onClose={onClose}>
      <View style={styles.form}>
        <AppInput label="Название" value={name} onChangeText={setName} />
        {rows.map((row, idx) => (
          <View key={idx} style={styles.componentBlock}>
            <AppText variant="caption" color="textSecondary">
              Компонент {idx + 1}
            </AppText>
            <View style={styles.chipWrap}>
              {simpleProducts.slice(0, 12).map((p: FoodProduct) => (
                <AppChip
                  key={p.id}
                  label={p.name.length > 14 ? `${p.name.slice(0, 14)}…` : p.name}
                  variant="pill"
                  active={row.productId === String(p.id)}
                  onPress={() =>
                    setRows(prev =>
                      prev.map((r, i) =>
                        i === idx ? {...r, productId: String(p.id)} : r,
                      ),
                    )
                  }
                />
              ))}
            </View>
            <AppInput
              label="Грамм"
              value={row.quantityG}
              onChangeText={v =>
                setRows(prev => prev.map((r, i) => (i === idx ? {...r, quantityG: v} : r)))
              }
              keyboardType="number-pad"
            />
          </View>
        ))}
        <AppButton label="Ещё компонент" variant="secondary" size="sm" onPress={addRow} />
        <AppButton label="Сохранить" onPress={save} loading={saving} fullWidth />
      </View>
    </AppSheet>
  );
}

const styles = StyleSheet.create({
  form: {gap: 12, paddingBottom: 24},
  componentBlock: {gap: 8},
  chipWrap: {flexDirection: 'row', flexWrap: 'wrap', gap: 6},
});
