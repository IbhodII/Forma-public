import React, {useState} from 'react';
import {FlatList, StyleSheet, View} from 'react-native';
import {useQuery, useQueryClient} from '@tanstack/react-query';

import {getProducts} from '../api/food';
import {useOffline} from '../context/OfflineContext';
import {
  AppButton,
  AppCard,
  AppEmptyState,
  AppErrorState,
  AppInput,
  AppLoadingState,
  AppText,
} from '../design-system';
import type {FoodProduct} from '../types/food';
import {CatalogProductSheet} from './food/CatalogProductSheet';
import {CompositeProductSheet} from './food/CompositeProductSheet';

export function FoodProductsTab() {
  const {isOnline} = useOffline();
  const qc = useQueryClient();
  const [query, setQuery] = useState('');
  const [editorProduct, setEditorProduct] = useState<FoodProduct | null | undefined>(
    undefined,
  );
  const [compositeProduct, setCompositeProduct] = useState<FoodProduct | null | undefined>(
    undefined,
  );

  const productsQuery = useQuery({
    queryKey: ['food-products-catalog', query],
    queryFn: () => getProducts(query || undefined),
  });

  const invalidate = () => {
    void qc.invalidateQueries({queryKey: ['food-products-catalog']});
    void qc.invalidateQueries({queryKey: ['food-products-simple']});
  };

  return (
    <View style={styles.root}>
      {!isOnline ? (
        <AppText variant="caption" color="textSecondary">
          Каталог из кэша. Создание и правка — только онлайн.
        </AppText>
      ) : null}
      <AppInput
        placeholder="Поиск продукта"
        value={query}
        onChangeText={setQuery}
      />
      <View style={styles.actions}>
        <AppButton
          label="Продукт"
          icon="add"
          size="sm"
          onPress={() => setEditorProduct(null)}
          disabled={!isOnline}
        />
        <AppButton
          label="Составное"
          icon="restaurant"
          size="sm"
          variant="secondary"
          onPress={() => setCompositeProduct(null)}
          disabled={!isOnline}
        />
        <AppButton
          label="Обновить"
          size="sm"
          variant="secondary"
          onPress={() => productsQuery.refetch()}
        />
      </View>

      {productsQuery.isLoading ? <AppLoadingState label="Загрузка…" compact /> : null}
      {productsQuery.isError ? (
        <AppErrorState
          message="Не удалось загрузить каталог продуктов"
          onRetry={() => productsQuery.refetch()}
          compact
        />
      ) : null}

      <FlatList
        data={productsQuery.data || []}
        keyExtractor={p => String(p.id)}
        scrollEnabled={false}
        renderItem={({item}) => (
          <AppCard padding="md" style={styles.card}>
            <AppText variant="title2">{item.name}</AppText>
            <AppText variant="caption" color="textSecondary">
              Б/Ж/У: {item.protein}/{item.fat}/{item.carbs} · {item.calories} ккал
              {item.is_composite ? ' · составное' : ''}
            </AppText>
            {isOnline ? (
              <View style={styles.row}>
                <AppButton
                  label="Изменить"
                  size="sm"
                  variant="secondary"
                  onPress={() =>
                    item.is_composite
                      ? setCompositeProduct(item)
                      : setEditorProduct(item)
                  }
                />
              </View>
            ) : null}
          </AppCard>
        )}
        ListEmptyComponent={
          !productsQuery.isLoading ? (
            <AppEmptyState title="Продукты не найдены" compact />
          ) : null
        }
      />

      <CatalogProductSheet
        visible={editorProduct !== undefined}
        product={editorProduct ?? null}
        onClose={() => setEditorProduct(undefined)}
        onSaved={invalidate}
      />
      <CompositeProductSheet
        visible={compositeProduct !== undefined}
        editProduct={compositeProduct ?? null}
        onClose={() => setCompositeProduct(undefined)}
        onSaved={invalidate}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, gap: 10},
  actions: {flexDirection: 'row', flexWrap: 'wrap', gap: 8},
  card: {marginBottom: 8},
  row: {flexDirection: 'row', marginTop: 8, gap: 8},
});
