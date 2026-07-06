import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { colors, radius, spacing } from '@adn/ui-tokens';
import { crearUbicacion } from '../lib/services';
import { guardarUbicacionLocal } from '../db/sync';
import { useUbicacionActivaStore } from '../lib/ubicacion-activa-store';
import { HeaderBar } from '../components/HeaderBar';
import { PrimaryButton } from '../components/PrimaryButton';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'UbicacionNoRegistrada'>;

const formSchema = z.object({
  sede: z.string().min(1, 'El nombre de la sede es obligatorio'),
  detalle: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

export function UbicacionNoRegistradaScreen({ route, navigation }: Props) {
  const { codigo } = route.params;
  const [enviando, setEnviando] = useState(false);

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { sede: '', detalle: '' },
  });

  const onSubmit = async (values: FormValues) => {
    setEnviando(true);
    try {
      const ubicacion = await crearUbicacion({
        codigo,
        sede: values.sede,
        detalle: values.detalle || null,
      });
      await guardarUbicacionLocal(ubicacion);
      useUbicacionActivaStore.getState().setUbicacionActiva(ubicacion);
      navigation.replace('Inicio');
    } catch {
      Alert.alert('Error', 'No se pudo registrar la ubicación. Verifica tu conexión e intenta de nuevo.');
      setEnviando(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#fff' }}>
      <HeaderBar title="Registrar ubicación nueva" subtitle={codigo} onBack={() => navigation.goBack()} />

      <ScrollView contentContainerStyle={{ padding: spacing[4], paddingBottom: 120 }}>
        <Text style={styles.hint}>
          No encontramos una ubicación con este código. Registra el nombre de la sede para poder auditar activos
          en ella.
        </Text>

        <Text style={styles.sectionLabel}>Nombre de la sede</Text>
        <Controller
          control={control}
          name="sede"
          render={({ field: { value, onChange } }) => (
            <TextInput value={value} onChangeText={onChange} style={styles.input} placeholder="Ej. Bodega Norte" />
          )}
        />
        {errors.sede && <Text style={styles.errorTexto}>{errors.sede.message}</Text>}

        <Text style={styles.sectionLabel}>Detalle (opcional)</Text>
        <Controller
          control={control}
          name="detalle"
          render={({ field: { value, onChange } }) => (
            <TextInput
              value={value}
              onChangeText={onChange}
              style={styles.input}
              placeholder="Ej. Piso 2, ala sur"
            />
          )}
        />
      </ScrollView>

      <SafeAreaView edges={['bottom']} style={styles.acciones}>
        <PrimaryButton
          label={enviando ? 'Guardando…' : 'Registrar ubicación'}
          onPress={() => void handleSubmit(onSubmit)()}
          disabled={enviando}
        />
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
  errorTexto: { color: colors.state.danger, fontSize: 12, marginTop: spacing[1] },
  acciones: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: colors.ink[200],
    padding: spacing[4],
  },
});
