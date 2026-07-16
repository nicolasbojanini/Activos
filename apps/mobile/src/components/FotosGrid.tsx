import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Camera, X } from 'lucide-react-native';
import { colors, radius, spacing } from '@adn/ui-tokens';
import type { FotoCapturada } from '../lib/fotos';

export const ETIQUETAS_FOTO = ['Vista general', 'Placa / QR', 'N° de serie', 'Entorno'];

/** Orden del único slot obligatorio — "Vista general" siempre debe capturarse. */
export const ORDEN_FOTO_OBLIGATORIA = 0;

interface FotosGridProps {
  fotos: FotoCapturada[];
  onCapturar: (etiqueta: string, orden: number) => void;
  onQuitar: (orden: number) => void;
}

export function FotosGrid({ fotos, onCapturar, onQuitar }: FotosGridProps) {
  return (
    <View>
      <View style={styles.headerRow}>
        <Text style={styles.sectionLabel}>Fotos</Text>
        <Text style={styles.contador}>{fotos.length}/4</Text>
      </View>
      <View style={styles.grid}>
        {ETIQUETAS_FOTO.map((etiqueta, orden) => {
          const foto = fotos.find((f) => f.orden === orden);
          const obligatoria = orden === ORDEN_FOTO_OBLIGATORIA;
          return (
            <Pressable
              key={orden}
              style={styles.slot}
              onPress={() => !foto && onCapturar(etiqueta, orden)}
            >
              {foto ? (
                <>
                  <Image source={{ uri: foto.localUri }} style={styles.thumb} />
                  <View style={styles.etiquetaBadge}>
                    <Text style={styles.etiquetaTexto} numberOfLines={1}>
                      {etiqueta}
                    </Text>
                  </View>
                  <Pressable style={styles.removeBtn} onPress={() => onQuitar(orden)} hitSlop={8}>
                    <X size={12} color="#fff" />
                  </Pressable>
                </>
              ) : (
                <>
                  <Camera size={20} color={colors.ink[400]} strokeWidth={1.8} />
                  <Text style={styles.slotLabel} numberOfLines={2}>
                    {etiqueta}
                    {obligatoria && <Text style={styles.slotObligatoria}> *</Text>}
                  </Text>
                </>
              )}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing[4] },
  sectionLabel: { fontSize: 13, fontWeight: '600', color: colors.ink[700] },
  contador: { fontSize: 12, color: colors.ink[500] },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2], marginTop: spacing[2] },
  slot: {
    width: 76,
    height: 76,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.ink[300],
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    padding: spacing[1],
  },
  slotLabel: { fontSize: 10, color: colors.ink[500], textAlign: 'center', marginTop: 4 },
  slotObligatoria: { color: colors.state.danger, fontWeight: '700' },
  thumb: { width: '100%', height: '100%' },
  etiquetaBadge: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(16,17,20,0.65)',
    paddingVertical: 2,
    paddingHorizontal: 4,
  },
  etiquetaTexto: { color: '#fff', fontSize: 9, fontWeight: '600', textAlign: 'center' },
  removeBtn: {
    position: 'absolute',
    top: 2,
    right: 2,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: 'rgba(16,17,20,0.65)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
