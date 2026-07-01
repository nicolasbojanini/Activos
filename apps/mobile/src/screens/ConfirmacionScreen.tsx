import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CheckCircle2, PlusCircle, TriangleAlert, XCircle } from 'lucide-react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { colors, radius, spacing } from '@adn/ui-tokens';
import { PrimaryButton } from '../components/PrimaryButton';
import { EstadoBadge } from '../components/EstadoBadge';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Confirmacion'>;

const ICONOS = {
  AUDITADO: { Icon: CheckCircle2, color: colors.state.success },
  DIFERENCIA: { Icon: TriangleAlert, color: colors.state.warning },
  FALTANTE: { Icon: XCircle, color: colors.state.danger },
  NO_REGISTRADO: { Icon: PlusCircle, color: colors.brand.blue },
} as const;

export function ConfirmacionScreen({ route, navigation }: Props) {
  const { resultado, titulo, mensaje, nombreActivo, placa } = route.params;
  const { Icon, color } = ICONOS[resultado];

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={[styles.circle, { backgroundColor: `${color}1A` }]}>
          <Icon size={40} color={color} strokeWidth={1.8} />
        </View>
        <Text style={styles.titulo}>{titulo}</Text>
        <Text style={styles.mensaje}>{mensaje}</Text>

        {nombreActivo && (
          <View style={styles.resumenCard}>
            {placa && <Text style={styles.placa}>{placa}</Text>}
            <Text style={styles.nombre}>{nombreActivo}</Text>
            <EstadoBadge estado={resultado} />
          </View>
        )}
      </View>

      <View style={styles.acciones}>
        <PrimaryButton label="Escanear siguiente activo" onPress={() => navigation.navigate('Escaneo')} />
        <View style={{ height: spacing[2] }} />
        <PrimaryButton label="Volver a la lista" variant="outline" onPress={() => navigation.navigate('Inicio')} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', justifyContent: 'space-between' },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing[6] },
  circle: { width: 88, height: 88, borderRadius: 44, alignItems: 'center', justifyContent: 'center', marginBottom: spacing[4] },
  titulo: { fontSize: 20, fontWeight: '600', color: colors.brand.black, marginBottom: spacing[2], textAlign: 'center' },
  mensaje: { fontSize: 14, color: colors.ink[500], textAlign: 'center', marginBottom: spacing[6], lineHeight: 20 },
  resumenCard: {
    width: '100%',
    borderWidth: 1,
    borderColor: colors.ink[200],
    borderRadius: radius.lg,
    padding: spacing[4],
    alignItems: 'flex-start',
    gap: spacing[1],
  },
  placa: { fontFamily: 'monospace', color: colors.brand.blue, fontWeight: '600', fontSize: 13 },
  nombre: { fontSize: 15, fontWeight: '600', color: colors.brand.black, marginBottom: spacing[1] },
  acciones: { padding: spacing[4] },
});
