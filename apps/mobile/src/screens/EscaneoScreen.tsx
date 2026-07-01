import { useEffect, useMemo, useState } from 'react';
import { Animated, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { X, Keyboard } from 'lucide-react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import NetInfo from '@react-native-community/netinfo';
import { colors, radius, spacing } from '@adn/ui-tokens';
import { buscarActivoPorQR } from '../lib/services';
import { buscarActivoLocalPorQR } from '../db/sync';
import { ApiError } from '../lib/api';
import { PrimaryButton } from '../components/PrimaryButton';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Escaneo'>;

const VISOR_SIZE = 240;

export function EscaneoScreen({ navigation }: Props) {
  const [permission, requestPermission] = useCameraPermissions();
  const [locked, setLocked] = useState(false);
  const [manualVisible, setManualVisible] = useState(false);
  const [manualCodigo, setManualCodigo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const scanLine = useMemo(() => new Animated.Value(0), []);

  useEffect(() => {
    if (!permission?.granted) {
      void requestPermission();
    }
  }, [permission, requestPermission]);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(scanLine, { toValue: 1, duration: 1500, useNativeDriver: true }),
        Animated.timing(scanLine, { toValue: 0, duration: 1500, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [scanLine]);

  const resolverCodigo = async (codigoQR: string) => {
    setError(null);

    // Offline-first: primero se busca en el espejo local descargado al iniciar sesión.
    const local = await buscarActivoLocalPorQR(codigoQR);
    if (local) {
      navigation.replace('Detalle', { activoId: local.id, escaneado: true });
      return;
    }

    const estadoRed = await NetInfo.fetch();
    if (!estadoRed.isConnected) {
      // Sin red y sin match local: se ofrece el flujo de "no registrado" (se confirmará contra el servidor al sincronizar).
      navigation.replace('NoRegistrado', { codigoQR });
      return;
    }

    try {
      const activo = await buscarActivoPorQR(codigoQR);
      navigation.replace('Detalle', { activoId: activo.id, escaneado: true });
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        navigation.replace('NoRegistrado', { codigoQR });
      } else {
        setError('No se pudo resolver el código. Intenta de nuevo.');
        setLocked(false);
      }
    }
  };

  const handleScanned = ({ data }: { data: string }) => {
    if (locked) return;
    setLocked(true);
    void resolverCodigo(data);
  };

  const translateY = scanLine.interpolate({ inputRange: [0, 1], outputRange: [0, VISOR_SIZE - 4] });

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <X size={24} color="#fff" />
        </Pressable>
      </View>

      {permission?.granted ? (
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={locked ? undefined : handleScanned}
        />
      ) : (
        <View style={styles.permisoDenegado}>
          <Text style={styles.permisoTexto}>
            Necesitamos acceso a la cámara para escanear el código QR del activo.
          </Text>
          <PrimaryButton label="Solicitar permiso" onPress={() => void requestPermission()} />
        </View>
      )}

      <View style={styles.overlay} pointerEvents="box-none">
        <View style={styles.visor}>
          <View style={[styles.corner, styles.cornerTL]} />
          <View style={[styles.corner, styles.cornerTR]} />
          <View style={[styles.corner, styles.cornerBL]} />
          <View style={[styles.corner, styles.cornerBR]} />
          <Animated.View style={[styles.scanLine, { transform: [{ translateY }] }]} />
        </View>
        <Text style={styles.detectando}>{locked ? 'Resolviendo…' : 'Detectando código QR…'}</Text>
        {error && <Text style={styles.errorTexto}>{error}</Text>}

        <Pressable style={styles.manualButton} onPress={() => setManualVisible(true)}>
          <Keyboard size={16} color="#fff" />
          <Text style={styles.manualLabel}>Ingresar código manualmente</Text>
        </Pressable>
      </View>

      <Modal visible={manualVisible} transparent animationType="slide" onRequestClose={() => setManualVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Ingresar código manualmente</Text>
            <TextInput
              value={manualCodigo}
              onChangeText={setManualCodigo}
              placeholder="Código del activo"
              autoCapitalize="characters"
              style={styles.modalInput}
            />
            <View style={{ flexDirection: 'row', gap: spacing[2], marginTop: spacing[4] }}>
              <View style={{ flex: 1 }}>
                <PrimaryButton label="Cancelar" variant="outline" onPress={() => setManualVisible(false)} />
              </View>
              <View style={{ flex: 1 }}>
                <PrimaryButton
                  label="Buscar"
                  disabled={!manualCodigo.trim()}
                  onPress={() => {
                    setManualVisible(false);
                    setLocked(true);
                    void resolverCodigo(manualCodigo.trim());
                  }}
                />
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0B0C0F' },
  header: { paddingTop: 56, paddingHorizontal: spacing[4], paddingBottom: spacing[3] },
  permisoDenegado: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing[6], gap: spacing[4] },
  permisoTexto: { color: '#fff', textAlign: 'center', fontSize: 14 },
  overlay: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: spacing[10] },
  visor: {
    width: VISOR_SIZE,
    height: VISOR_SIZE,
    overflow: 'hidden',
  },
  corner: { position: 'absolute', width: 32, height: 32, borderColor: colors.brand.blue },
  cornerTL: { top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3, borderTopLeftRadius: radius.md },
  cornerTR: { top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3, borderTopRightRadius: radius.md },
  cornerBL: { bottom: 0, left: 0, borderBottomWidth: 3, borderLeftWidth: 3, borderBottomLeftRadius: radius.md },
  cornerBR: { bottom: 0, right: 0, borderBottomWidth: 3, borderRightWidth: 3, borderBottomRightRadius: radius.md },
  scanLine: { height: 2, backgroundColor: colors.brand.blue },
  detectando: { color: '#fff', fontSize: 13, marginTop: spacing[4] },
  errorTexto: { color: colors.state.danger, fontSize: 13, marginTop: spacing[2], textAlign: 'center', paddingHorizontal: spacing[6] },
  manualButton: { flexDirection: 'row', alignItems: 'center', gap: spacing[2], marginTop: spacing[6] },
  manualLabel: { color: '#fff', fontSize: 13, fontWeight: '600', textDecorationLine: 'underline' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: '#fff', borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: spacing[6] },
  modalTitle: { fontSize: 16, fontWeight: '600', marginBottom: spacing[4], color: colors.brand.black },
  modalInput: {
    borderWidth: 1,
    borderColor: colors.ink[200],
    borderRadius: radius.md,
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[3],
    fontSize: 14,
  },
});
