import {useCallback, useEffect, useState} from 'react';
import {Dimensions, type LayoutChangeEvent, StyleSheet} from 'react-native';
import {useFocusEffect} from '@react-navigation/native';

/** Measures chart container width; remeasures on focus and orientation change. */
export function useChartContainerWidth() {
  const [width, setWidth] = useState(0);
  const [layoutKey, setLayoutKey] = useState(0);

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    if (w > 0) {
      setWidth(w);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLayoutKey(k => k + 1);
    }, []),
  );

  useEffect(() => {
    const sub = Dimensions.addEventListener('change', () => {
      setLayoutKey(k => k + 1);
    });
    return () => sub.remove();
  }, []);

  return {width, onLayout, layoutKey, containerStyle: chartContainerStyle};
}

const chartContainerStyle = StyleSheet.create({
  root: {
    width: '100%',
    alignSelf: 'stretch',
    minWidth: 0,
  },
}).root;
