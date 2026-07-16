import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { colors, radius, spacing } from '@adn/ui-tokens';
import { useUbicacionActivaStore } from '../lib/ubicacion-activa-store';
import { HeaderBar } from '../components/HeaderBar';
import { PrimaryButton } from '../components/PrimaryButton';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Ubicacion'>;

/**
 * La ubicación ya no se escanea ni se valida contra la base — el auditor la
 * escribe a mano y ese texto queda de inmediato como "ubicación activa" de
 * la sesión, sin ningún llamado a la red (funciona sin conexión). El
 * servidor recién resuelve o crea la Ubicacion real cuando el registro de
 * auditoría se sincroniza (ver resolverUbicacionIdPorNombre en la API).
 */
export function UbicacionScreen({ navigation }: Props) {
  const ubicacionActiva = useUbicacionActivaStore((s) => s.ubicacionActiva);
  const [sede, setSede] = useState(ubicacionActiva?.sede ?? '');

  const usar = () => {
    const texto = sede.trim();
    if (!texto) return;
    useUbicacionActivaStore.getState().setUbicacionActiva(texto);
    navigation.replace('Inicio');
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#fff' }}>
      <HeaderBar title="Ubicación de la sesión" onBack={() => navigation.goBack()} />

      <View style={{ padding: spacing[4], flex: 1 }}>
        <Text style={styles.hint}>
          Escribe dónde estás auditando ahora. Se aplicará como la ubicación de los activos que registres a
          continuación, hasta que la cambies.
        </Text>

        <Text style={styles.sectionLabel}>Ubicación</Text>
        <TextInput
          value={sede}
          onChangeText={setSede}
          style={styles.input}
          placeholder="Ej. Bodega Norte, piso 2"
          autoFocus
          returnKeyType="done"
          onSubmitEditing={usar}
        />
      </View>

      <SafeAreaView edges={['bottom']} style={styles.acciones}>
        <PrimaryButton label="Usar esta ubicación" onPress={usar} disabled={!sede.trim()} />
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  hint: { fontSize: 13, color: colors.ink[500], marginBottom: spacing[4], lineHeight: 18 },
  sectionLabel: { fontSize: 13, fontWeight: '600', color: colors.ink[700], marginBottom: spacing[2] },
  input: {
    borderWidth: 1,
    borderColor: colors.ink[200],
    borderRadius: radius.md,
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[3],
    fontSize: 14,
  },
  acciones: {
    borderTopWidth: 1,
    borderTopColor: colors.ink[200],
    padding: spacing[4],
  },
});
