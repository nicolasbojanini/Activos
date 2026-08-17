import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, BackHandler, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Camera, X } from 'lucide-react-native';
import { colors, spacing } from '@adn/ui-tokens';
import { ANCHO_FOTO, guardarFotoCapturada, type FotoCapturada } from '../lib/fotos';
import { PrimaryButton } from './PrimaryButton';

/** Slot de foto que se está capturando (etiqueta visible + orden dentro de la grilla). */
export interface DestinoFoto {
  etiqueta: string;
  orden: number;
}

interface Props {
  /** Slot a capturar; null mantiene la cámara cerrada. */
  destino: DestinoFoto | null;
  onCapturada: (foto: FotoCapturada) => void;
  onCancelar: () => void;
}

/**
 * Cámara embebida para las fotos de auditoría.
 *
 * Reemplaza a ImagePicker.launchCameraAsync (la app de cámara del sistema) por
 * dos razones que venían golpeando al equipo en campo:
 *
 * 1. Abrir otra app mandaba la nuestra a segundo plano, donde Android la puede
 *    matar para darle memoria a la cámara — y ahí se perdía el activo a medio
 *    llenar. Capturando acá adentro nunca salimos de primer plano.
 * 2. El picker devuelve la foto a la resolución máxima del sensor (12MP+), que
 *    hay que decodificar entera para reducirla: decenas de MB de bitmap y varios
 *    segundos de CPU en un teléfono de gama baja, con el hilo trabado. Acá se
 *    elige un tamaño de captura acotado de entrada (pictureSize), así no hay
 *    nada gigante que decodificar.
 */
export function CamaraFoto({ destino, onCapturada, onCancelar }: Props) {
  const [permiso, pedirPermiso] = useCameraPermissions();
  const camaraRef = useRef<CameraView>(null);
  const [tamanoCaptura, setTamanoCaptura] = useState<string | undefined>(undefined);
  const [procesando, setProcesando] = useState(false);
  // Ref y no estado: el chequeo contra el doble toque tiene que ser inmediato,
  // sin esperar a que React re-renderice.
  const capturandoRef = useRef(false);

  const abierta = destino !== null;

  useEffect(() => {
    if (abierta && permiso && !permiso.granted && permiso.canAskAgain) void pedirPermiso();
  }, [abierta, permiso, pedirPermiso]);

  /**
   * Elige el tamaño de captura más chico que todavía cubra ANCHO_FOTO. Los
   * dispositivos devuelven cadenas tipo "1920x1080"; si ninguno alcanza el
   * objetivo se usa el más grande disponible, y si la lista no se puede leer se
   * deja el default del dispositivo (guardarFotoCapturada reduce igual).
   */
  const alEstarLista = async () => {
    if (tamanoCaptura) return;
    try {
      const disponibles = await camaraRef.current?.getAvailablePictureSizesAsync();
      if (!disponibles?.length) return;
      const ordenados = disponibles
        .map((valor) => ({ valor, ancho: Number.parseInt(valor.split(/[x×]/)[0] ?? '', 10) }))
        .filter((t) => Number.isFinite(t.ancho) && t.ancho > 0)
        .sort((a, b) => a.ancho - b.ancho);
      if (ordenados.length === 0) return;
      const elegido = ordenados.find((t) => t.ancho >= ANCHO_FOTO) ?? ordenados[ordenados.length - 1];
      setTamanoCaptura(elegido.valor);
    } catch {
      // Sin lista de tamaños se captura con el default del dispositivo.
    }
  };

  const disparar = async () => {
    if (!destino || capturandoRef.current) return;
    capturandoRef.current = true;
    setProcesando(true);
    try {
      const foto = await camaraRef.current?.takePictureAsync({ quality: 0.8 });
      if (!foto) return;
      const guardada = await guardarFotoCapturada(foto.uri, destino.etiqueta, destino.orden, foto.width, foto.height);
      onCapturada(guardada);
    } catch {
      Alert.alert('No se pudo tomar la foto', 'Intenta de nuevo.');
    } finally {
      capturandoRef.current = false;
      setProcesando(false);
    }
  };

  // El botón atrás de Android cierra la cámara en vez de salir de la pantalla de
  // auditoría (que perdería el formulario a medio llenar).
  useEffect(() => {
    if (!abierta) return;
    const suscripcion = BackHandler.addEventListener('hardwareBackPress', () => {
      onCancelar();
      return true;
    });
    return () => suscripcion.remove();
  }, [abierta, onCancelar]);

  // Overlay absoluto y NO un <Modal> a propósito: la preview de CameraView dentro
  // de un Modal de React Native queda en negro en varios equipos Android. Como
  // esto se renderiza último dentro del View raíz de la pantalla, pinta encima
  // igual, sin ese riesgo.
  if (!abierta) return null;

  return (
    <View style={[StyleSheet.absoluteFill, styles.contenedor]}>
      <View style={styles.fondo}>
        {/* La cámara se monta solo mientras está abierta: no tiene sentido
            mantener el sensor tomado (y su memoria) durante el llenado. */}
        {permiso?.granted && (
          <CameraView
            ref={camaraRef}
            style={StyleSheet.absoluteFill}
            facing="back"
            pictureSize={tamanoCaptura}
            onCameraReady={() => void alEstarLista()}
          />
        )}

        {!permiso?.granted && (
          <View style={styles.sinPermiso}>
            <Text style={styles.sinPermisoTexto}>
              Para tomar las fotos del activo hay que permitir el acceso a la cámara.
            </Text>
            <PrimaryButton label="Permitir cámara" onPress={() => void pedirPermiso()} />
            <PrimaryButton label="Cancelar" variant="outline" onPress={onCancelar} />
          </View>
        )}

        <SafeAreaView edges={['top']} style={styles.barraSuperior}>
          <Text style={styles.etiqueta}>{destino?.etiqueta ?? ''}</Text>
          <Pressable onPress={onCancelar} hitSlop={12} style={styles.cerrar}>
            <X size={20} color="#fff" />
          </Pressable>
        </SafeAreaView>

        {permiso?.granted && (
          <SafeAreaView edges={['bottom']} style={styles.barraInferior}>
            <Pressable
              onPress={() => void disparar()}
              disabled={procesando}
              style={[styles.disparador, procesando && styles.disparadorOcupado]}
              hitSlop={8}
            >
              {procesando ? (
                <ActivityIndicator color={colors.brand.blue} />
              ) : (
                <Camera size={26} color={colors.brand.blue} strokeWidth={1.8} />
              )}
            </Pressable>
          </SafeAreaView>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // zIndex/elevation para quedar por encima de la barra de acciones de la
  // pantalla, que también está posicionada de forma absoluta.
  contenedor: { zIndex: 10, elevation: 10 },
  fondo: { flex: 1, backgroundColor: '#000' },
  barraSuperior: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing[4],
    paddingBottom: spacing[3],
    backgroundColor: 'rgba(16,17,20,0.45)',
  },
  etiqueta: { color: '#fff', fontSize: 14, fontWeight: '600', flexShrink: 1 },
  cerrar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  barraInferior: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingBottom: spacing[4],
    paddingTop: spacing[4],
    backgroundColor: 'rgba(16,17,20,0.45)',
  },
  disparador: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: 'rgba(255,255,255,0.5)',
  },
  disparadorOcupado: { opacity: 0.7 },
  sinPermiso: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[4],
    padding: spacing[6],
    backgroundColor: colors.ink[50],
  },
  sinPermisoTexto: { textAlign: 'center', fontSize: 14, color: colors.ink[700] },
});
