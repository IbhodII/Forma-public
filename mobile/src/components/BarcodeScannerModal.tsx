import React, {useCallback, useEffect, useRef, useState} from 'react';
import {ActivityIndicator, Modal, StyleSheet, View} from 'react-native';
import {PERMISSIONS, RESULTS, check, request} from 'react-native-permissions';
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
  useFrameProcessor,
} from 'react-native-vision-camera';
import {
  BarcodeFormat,
  useBarcodeScanner,
} from 'react-native-vision-camera-mlkit-plugin';
import {Worklets} from 'react-native-worklets-core';

import {normalizeBarcode} from '../utils/nutrition';
import {AppButton, AppText} from '../design-system';
import {useDesignSystem} from '../design-system/useDesignSystem';

type Props = {
  visible: boolean;
  onClose: () => void;
  onBarcode: (barcode: string) => void;
};

export function BarcodeScannerModal({visible, onClose, onBarcode}: Props) {
  const {colors, radius, layout} = useDesignSystem();
  const scanLock = useRef(false);
  const [androidCameraOk, setAndroidCameraOk] = useState(false);
  const {hasPermission, requestPermission} = useCameraPermission();
  const device = useCameraDevice('back');

  const {scanBarcode} = useBarcodeScanner({
    formats: [
      BarcodeFormat.EAN_13,
      BarcodeFormat.EAN_8,
      BarcodeFormat.UPC_A,
      BarcodeFormat.UPC_E,
      BarcodeFormat.CODE_128,
    ],
  });

  const ensureAndroidPermission = useCallback(async () => {
    const current = await check(PERMISSIONS.ANDROID.CAMERA);
    if (current === RESULTS.GRANTED) {
      setAndroidCameraOk(true);
      return true;
    }
    const asked = await request(PERMISSIONS.ANDROID.CAMERA);
    const granted = asked === RESULTS.GRANTED;
    setAndroidCameraOk(granted);
    return granted;
  }, []);

  const handleDetected = Worklets.createRunOnJS((raw: string) => {
    const code = normalizeBarcode(raw);
    if (code.length < 8 || scanLock.current) {
      return;
    }
    scanLock.current = true;
    onBarcode(code);
    onClose();
    setTimeout(() => {
      scanLock.current = false;
    }, 1500);
  });

  const frameProcessor = useFrameProcessor(
    frame => {
      'worklet';
      const result = scanBarcode(frame);
      const value = result?.barcodes?.[0]?.displayValue;
      if (value) {
        handleDetected(value);
      }
    },
    [scanBarcode, handleDetected],
  );

  const requestAllPermissions = useCallback(async () => {
    await requestPermission();
    await ensureAndroidPermission();
  }, [requestPermission, ensureAndroidPermission]);

  useEffect(() => {
    if (visible) {
      requestAllPermissions().catch(() => undefined);
    }
  }, [visible, requestAllPermissions]);

  const canUseCamera = hasPermission && androidCameraOk && Boolean(device);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.root, {backgroundColor: colors.bg, gap: layout.blockGap}]}>
        <AppText variant="title2" color="textInverse">
          Сканер штрихкода
        </AppText>
        <AppText variant="caption" color="textMuted">
          Наведите камеру на EAN/UPC штрихкод продукта
        </AppText>

        <View style={[styles.preview, {borderRadius: radius.md, backgroundColor: colors.overlay}]}>
          {!canUseCamera ? (
            <View style={styles.placeholder}>
              <AppText variant="body" color="textInverse" style={styles.placeholderText}>
                Нужен доступ к камере
              </AppText>
              <AppButton
                label="Разрешить камеру"
                size="sm"
                onPress={() => void requestAllPermissions()}
              />
            </View>
          ) : (
            <Camera
              style={StyleSheet.absoluteFill}
              device={device!}
              isActive={visible}
              frameProcessor={frameProcessor}
            />
          )}
        </View>

        {!device && <ActivityIndicator color={colors.accent} style={styles.loader} />}

        <AppButton label="Закрыть" variant="secondary" onPress={onClose} />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, padding: 12},
  preview: {
    flex: 1,
    minHeight: 320,
    overflow: 'hidden',
  },
  placeholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
    padding: 16,
  },
  placeholderText: {textAlign: 'center'},
  loader: {marginTop: 8},
});
