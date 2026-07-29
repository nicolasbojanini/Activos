import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { colors, radius, spacing } from '@adn/ui-tokens';
import { CLAVE_UBICACION_BASE, useUbicacionActivaStore } from '../lib/ubicacion-activa-store';
import { useConfiguracionCampos } from '../lib/useConfiguracionCampos';
import { HeaderBar } from '../components/HeaderBar';
import { PrimaryButton } from '../components/PrimaryButton';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Ubicacion'>;

/**
 * La ubicación ya no se escanea ni se valida contra la base — el auditor la
 * escribe a mano y ese texto queda de inmediato como "ubicación activa" de
 * la sesión, sin ningún llamado a la red (funciona sin conexión). "Ubicación"
 * es el campo base, siempre presente; el cliente puede configurar hasta 5
 * campos adicionales (Torre, Piso, Sede, etc. — ver "Campos de Ubicación" en
 * la web). El servidor recién resuelve o crea la Ubicacion real, y aplica
 * los campos extra al activo, cuando el registro de auditoría se sincroniza.
 */
export function UbicacionScreen({ navigation }: Props) {
  const ubicacionActiva = useUbicacionActivaStore((s) => s.ubicacionActiva);
  const { camposUbicacion } = useConfiguracionCampos();
  const [valores, setValores] = useState<Record<string, string>>(
    () => ubicacionActiva ?? { [CLAVE_UBICACION_BASE]: '' },
  );

  const base = (valores[CLAVE_UBICACION_BASE] ?? '').trim();

  const usar = () => {
    if (!base) return;
    const faltantes = camposUbicacion.filter((c) => c.requerido && !(valores[c.id] ?? '').trim());
    if (faltantes.length > 0) {
      Alert.alert('Completa los campos obligatorios', faltantes.map((c) => c.etiqueta).join(', '));
      return;
    }
    const limpio: Record<string, string> = { [CLAVE_UBICACION_BASE]: base };
    for (const c of camposUbicacion) {
      limpio[c.id] = (valores[c.id] ?? '').trim();
    }
    useUbicacionActivaStore.getState().setUbicacionActiva(limpio);
    navigation.replace('Inicio');
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#fff' }}>
      <HeaderBar title="Ubicación de la sesión" onBack={() => navigation.goBack()} />

      <ScrollView contentContainerStyle={{ padding: spacing[4], flexGrow: 1 }}>
        <Text style={styles.hint}>
          Escribe dónde estás auditando ahora. Se aplicará como la ubicación de los activos que registres a
          continuación, hasta que la cambies.
        </Text>

        <Text style={styles.sectionLabel}>
          Ubicación
          <Text style={{ color: colors.state.danger }}> *</Text>
        </Text>
        <TextInput
          value={valores[CLAVE_UBICACION_BASE] ?? ''}
          onChangeText={(texto) => setValores((v) => ({ ...v, [CLAVE_UBICACION_BASE]: texto }))}
          style={styles.input}
          placeholder="Ej. Bodega Norte"
          autoFocus
        />

        {camposUbicacion.map((c) => (
          <View key={c.id}>
            <Text style={styles.sectionLabel}>
              {c.etiqueta}
              {c.requerido && <Text style={{ color: colors.state.danger }}> *</Text>}
            </Text>
            <TextInput
              value={valores[c.id] ?? ''}
              onChangeText={(texto) => setValores((v) => ({ ...v, [c.id]: texto }))}
              style={styles.input}
              placeholder={c.etiqueta}
            />
          </View>
        ))}
      </ScrollView>

      <SafeAreaView edges={['bottom']} style={styles.acciones}>
        <PrimaryButton label="Usar esta ubicación" onPress={usar} disabled={!base} />
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  hint: { fontSize: 13, color: colors.ink[500], marginBottom: spacing[4], lineHeight: 18 },
  sectionLabel: { fontSize: 13, fontWeight: '600', color: colors.ink[700], marginTop: spacing[3], marginBottom: spacing[2] },
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
