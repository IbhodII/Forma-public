import AsyncStorage from '@react-native-async-storage/async-storage';
import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {ActivityIndicator, Alert, ScrollView, StyleSheet, View} from 'react-native';

import {
  createProduct,
  getProducts,
  lookupByBarcode,
  searchOpenFoodFacts,
} from '../api/food';
import type {FoodProduct} from '../types/food';
import {useOffline} from '../context/OfflineContext';
import {OnlineOnlyError} from '../services/onlineOnly';
import {BarcodeScannerModal} from './BarcodeScannerModal';
import {AppButton, AppCard, AppChip, AppInput, AppSheet, AppText} from '../design-system';
import {useDesignSystem} from '../design-system/useDesignSystem';

type Props = {
  visible: boolean;
  onClose: () => void;
  onSelectProduct: (product: FoodProduct) => void;
};

type Draft = {
  name: string;
  protein: string;
  fat: string;
  carbs: string;
  fiber_g: string;
  calories: string;
  external_id: string;
};

const emptyDraft: Draft = {
  name: '',
  protein: '',
  fat: '',
  carbs: '',
  fiber_g: '',
  calories: '',
  external_id: '',
};

const RECENT_KEY = 'food:recentProductIds';
const FAVORITES_KEY = 'food:favoriteProductIds';

function mapOffItemToFoodProduct(idx: number, item: {
  name: string;
  barcode?: string | null;
  calories?: number | null;
  protein?: number | null;
  fat?: number | null;
  carbs?: number | null;
  fiber?: number | null;
}): FoodProduct {
  return {
    id: -Math.abs(Date.now() + idx),
    name: item.name || 'Продукт OFF',
    protein: Number(item.protein ?? 0),
    fat: Number(item.fat ?? 0),
    carbs: Number(item.carbs ?? 0),
    calories: Number(item.calories ?? 0),
    fiber_g: Number(item.fiber ?? 0),
    unit: '100г',
    is_composite: false,
    is_alcohol: false,
    external_id: item.barcode ?? null,
  };
}

async function loadIdList(key: string): Promise<number[]> {
  const raw = await AsyncStorage.getItem(key);
  if (!raw) {
    return [];
  }
  try {
    return JSON.parse(raw) as number[];
  } catch {
    return [];
  }
}

async function pushRecent(id: number): Promise<void> {
  const ids = await loadIdList(RECENT_KEY);
  const next = [id, ...ids.filter(x => x !== id)].slice(0, 10);
  await AsyncStorage.setItem(RECENT_KEY, JSON.stringify(next));
}

export function AddProductModal({visible, onClose, onSelectProduct}: Props) {
  const {colors, layout} = useDesignSystem();
  const {isOnline} = useOffline();
  const [loading, setLoading] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<FoodProduct[]>([]);
  const [catalog, setCatalog] = useState<FoodProduct[]>([]);
  const [recentIds, setRecentIds] = useState<number[]>([]);
  const [favoriteIds, setFavoriteIds] = useState<number[]>([]);
  const [draft, setDraft] = useState<Draft>(emptyDraft);

  useEffect(() => {
    if (!visible) {
      return;
    }
    void (async () => {
      const [recent, favorites, local] = await Promise.all([
        loadIdList(RECENT_KEY),
        loadIdList(FAVORITES_KEY),
        getProducts(''),
      ]);
      setRecentIds(recent);
      setFavoriteIds(favorites);
      setCatalog(local || []);
    })();
  }, [visible]);

  const runSearch = useCallback(async () => {
    const q = query.trim();
    if (!q) {
      setResults([]);
      return;
    }
    setLoading(true);
    try {
      const local = await getProducts(q);
      let offMatches: FoodProduct[] = [];
      if (isOnline) {
        const off = await searchOpenFoodFacts(q);
        offMatches = [
          ...(off.local_matches || []).map(p => p),
          ...(off.items || []).map((p, idx) => mapOffItemToFoodProduct(idx, p)),
        ];
      }
      const dedup = new Map<string, FoodProduct>();
      [...(local || []), ...offMatches].forEach(p => {
        const key = `${p.name.toLowerCase()}|${p.external_id || ''}`;
        if (!dedup.has(key)) {
          dedup.set(key, p);
        }
      });
      setResults([...dedup.values()]);
    } catch (e) {
      if (e instanceof OnlineOnlyError) {
        Alert.alert('Офлайн', e.message);
      }
    } finally {
      setLoading(false);
    }
  }, [isOnline, query]);

  useEffect(() => {
    if (!visible) {
      return;
    }
    const t = setTimeout(() => {
      if (query.trim().length >= 2) {
        void runSearch();
      } else if (!query.trim()) {
        setResults([]);
      }
    }, 200);
    return () => clearTimeout(t);
  }, [query, visible, runSearch]);

  const filteredLocal = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      return [];
    }
    return catalog.filter(p => p.name.toLowerCase().includes(q)).slice(0, 40);
  }, [catalog, query]);

  const displayResults = useMemo(() => {
    if (results.length > 0) {
      return results;
    }
    return filteredLocal;
  }, [results, filteredLocal]);

  const pickProduct = (product: FoodProduct) => {
    if (product.id < 0) {
      setDraft({
        name: product.name,
        protein: String(product.protein ?? ''),
        fat: String(product.fat ?? ''),
        carbs: String(product.carbs ?? ''),
        fiber_g: String(product.fiber_g ?? ''),
        calories: String(product.calories ?? ''),
        external_id: product.external_id || '',
      });
      return;
    }
    void pushRecent(product.id);
    onSelectProduct(product);
    onClose();
  };

  const quickProducts = useMemo(() => {
    const ids = [...new Set([...favoriteIds, ...recentIds])];
    return ids
      .map(id => catalog.find(p => p.id === id))
      .filter((p): p is FoodProduct => Boolean(p));
  }, [catalog, favoriteIds, recentIds]);

  const hydrateByBarcode = async (barcode: string) => {
    setLoading(true);
    try {
      const data = await lookupByBarcode(barcode);
      if (data.existing_product) {
        pickProduct(data.existing_product);
        return;
      }
      if (data.preview) {
        setDraft({
          name: data.preview.name || '',
          protein: String(data.preview.protein ?? ''),
          fat: String(data.preview.fat ?? ''),
          carbs: String(data.preview.carbs ?? ''),
          fiber_g: String(data.preview.fiber_g ?? ''),
          calories: String(data.preview.calories ?? ''),
          external_id: data.barcode || data.preview.external_id || barcode,
        });
        return;
      }
      setDraft({
        ...emptyDraft,
        external_id: barcode,
      });
      Alert.alert(
        'Продукт не найден',
        'Штрихкод не найден в Open Food Facts. Заполните поля вручную.',
      );
    } catch (e) {
      if (e instanceof OnlineOnlyError) {
        Alert.alert('Офлайн', e.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const saveDraft = async () => {
    if (!draft.name.trim()) {
      Alert.alert('Ошибка', 'Укажите название продукта');
      return;
    }
    setLoading(true);
    try {
      const product = await createProduct({
        name: draft.name,
        protein: Number(draft.protein) || 0,
        fat: Number(draft.fat) || 0,
        carbs: Number(draft.carbs) || 0,
        fiber_g: Number(draft.fiber_g) || 0,
        calories: Number(draft.calories) || 0,
        external_id: draft.external_id || undefined,
      });
      pickProduct(product);
    } catch (e) {
      if (e instanceof OnlineOnlyError) {
        Alert.alert('Офлайн', e.message);
      } else {
        Alert.alert('Ошибка', e instanceof Error ? e.message : 'Не удалось сохранить');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <AppSheet visible={visible} title="Добавить продукт" onClose={onClose} scroll>
        {!isOnline ? (
          <AppText variant="caption" color="warning">
            Каталог ограничен — доступны только сохранённые продукты
          </AppText>
        ) : null}

        {quickProducts.length > 0 ? (
          <View style={styles.quickRow}>
            <AppText variant="caption" color="textSecondary">
              Недавние и избранное
            </AppText>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.chipRow}>
                {quickProducts.map(p => (
                  <AppChip
                    key={p.id}
                    label={p.name.length > 18 ? `${p.name.slice(0, 16)}…` : p.name}
                    variant="pill"
                    onPress={() => pickProduct(p)}
                  />
                ))}
              </View>
            </ScrollView>
          </View>
        ) : null}

        <AppButton
          label="Сканировать штрихкод"
          variant="secondary"
          disabled={!isOnline}
          onPress={() => setScannerOpen(true)}
        />

        <AppInput placeholder="Поиск по названию" value={query} onChangeText={setQuery} />
        <AppButton
          label={isOnline ? 'Искать (локально + OFF)' : 'Искать локально'}
          size="sm"
          onPress={() => void runSearch()}
        />

        {displayResults.map(p => (
          <AppCard key={p.id} padding="md" style={{marginBottom: layout.blockGapCompact}}>
            <AppButton label={p.name} variant="ghost" onPress={() => pickProduct(p)} />
            <AppText variant="caption" color="textMuted">
              Б/Ж/У: {p.protein}/{p.fat}/{p.carbs}
            </AppText>
          </AppCard>
        ))}

        <AppText variant="title3">Ручной ввод / предзаполнение</AppText>
        <AppInput placeholder="Название" value={draft.name} onChangeText={v => setDraft(s => ({...s, name: v}))} />
        <View style={styles.row}>
          <View style={styles.small}>
            <AppInput
              placeholder="Б"
              keyboardType="decimal-pad"
              value={draft.protein}
              onChangeText={v => setDraft(s => ({...s, protein: v}))}
            />
          </View>
          <View style={styles.small}>
            <AppInput
              placeholder="Ж"
              keyboardType="decimal-pad"
              value={draft.fat}
              onChangeText={v => setDraft(s => ({...s, fat: v}))}
            />
          </View>
          <View style={styles.small}>
            <AppInput
              placeholder="У"
              keyboardType="decimal-pad"
              value={draft.carbs}
              onChangeText={v => setDraft(s => ({...s, carbs: v}))}
            />
          </View>
        </View>
        <View style={styles.row}>
          <View style={styles.small}>
            <AppInput
              placeholder="Клетч."
              keyboardType="decimal-pad"
              value={draft.fiber_g}
              onChangeText={v => setDraft(s => ({...s, fiber_g: v}))}
            />
          </View>
          <View style={styles.small}>
            <AppInput
              placeholder="Ккал"
              keyboardType="decimal-pad"
              value={draft.calories}
              onChangeText={v => setDraft(s => ({...s, calories: v}))}
            />
          </View>
        </View>
        <AppInput
          placeholder="Штрихкод/external_id"
          value={draft.external_id}
          onChangeText={v => setDraft(s => ({...s, external_id: v}))}
        />
        <AppButton label="Сохранить продукт" disabled={!isOnline} onPress={() => void saveDraft()} />

        {loading ? <ActivityIndicator color={colors.accent} style={styles.loader} /> : null}
        <AppButton label="Закрыть" variant="secondary" onPress={onClose} />
      </AppSheet>

      <BarcodeScannerModal
        visible={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onBarcode={code => {
          void hydrateByBarcode(code);
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  row: {flexDirection: 'row', gap: 8},
  small: {flex: 1},
  loader: {marginTop: 8},
  quickRow: {gap: 8, marginBottom: 8},
  chipRow: {flexDirection: 'row', gap: 8, paddingVertical: 4},
});
