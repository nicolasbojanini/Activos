import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import * as Crypto from 'expo-crypto';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { EstadoFisico } from '@adn/shared';
import { colors, radius, spacing } from '@adn/ui-tokens';
import { apiFetch } from '../lib/api';
import { getActivo, crearRegistro } from '../lib/services';
import { useProyectoActual } from '../lib/useProyectoActual';
import { HeaderBar } from '../components/HeaderBar';
import { PrimaryButton } from '../components/PrimaryButton';
import type { RootStackParamList } from '../navigation/types';
import type { UbicacionOutput } from '@adn/shared';

type Props = NativeStackScreenProps<RootStackParamList, 'Actualizar'>;

const ESTADOS: { value: keyof typeof EstadoFisico; label: string }[] = [
  { value: 'BUENO', label: 'Bueno' },
  { value: 'REGULAR', label: 'Regular' },
  { value: 'MALO', label: 'Malo' },
  { value: 'BAJA', label: 'Baja' },
];

const ESTADO_COLOR: Record<string, string> = {
  BUENO: colors.state.success,
  REGULAR: colors.state.warning,
  MALO: colors.state.danger,
  BAJA: colors.ink[500],
};

const formSchema = z.object({
  estadoFisico: z.nativeEnum(EstadoFisico),
  ubicacionId: z.string().nullable(),
  responsable: z.string().nullable(),
  centroCosto: z.string().nullable(),
  nota: z.string().min(1, 'Agrega una nota describiendo el cambio'),
});

type FormValues = z.infer<typeof formSchema>;

export function ActualizarScreen({ route, navigation }: Props) {
  const { activoId } = route.params;
  const { proyecto } = useProyectoActual();
  const [enviando, setEnviando] = useState(false);
  const queryClient = useQueryClient();

  const { data: activo } = useQuery({ queryKey: ['activo', activoId], queryFn: () => getActivo(activoId) });
  const { data: ubicaciones } = useQuery({
    queryKey: ['ubicaciones'],
    queryFn: () => apiFetch<UbicacionOutput[]>('/ubicaciones'),
  });

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { estadoFisico: 'BUENO', ubicacionId: null, responsable: '', centroCosto: '', nota: '' },
  });

  useEffect(() => {
    if (activo) {
      reset({
        estadoFisico: activo.estadoFisico,
        ubicacionId: activo.ubicacion?.id ?? null,
        responsable: activo.responsable ?? '',
        centroCosto: activo.centroCosto ?? '',
        nota: '',
      });
    }
  }, [activo, reset]);

  const onSubmit = async (values: FormValues) => {
    if (!proyecto || !activo) return;
    setEnviando(true);

    const cambios: Record<string, { antes: unknown; despues: unknown }> = {};
    if (values.ubicacionId !== (activo.ubicacion?.id ?? null)) {
      cambios.ubicacionId = { antes: activo.ubicacion?.id ?? null, despues: values.ubicacionId };
    }
    if ((values.responsable || null) !== (activo.responsable ?? null)) {
      cambios.responsable = { antes: activo.responsable, despues: values.responsable || null };
    }
    if ((values.centroCosto || null) !== (activo.centroCosto ?? null)) {
      cambios.centroCosto = { antes: activo.centroCosto, despues: values.centroCosto || null };
    }
    if (values.estadoFisico !== activo.estadoFisico) {
      cambios.estadoFisico = { antes: activo.estadoFisico, despues: values.estadoFisico };
    }

    const hayDiferencias = Object.keys(cambios).length > 0;
    const estado = hayDiferencias ? 'DIFERENCIA' : 'AUDITADO';

    try {
      await crearRegistro({
        clientId: Crypto.randomUUID(),
        proyectoId: proyecto.id,
        activoId: activo.id,
        estado,
        estadoFisico: values.estadoFisico,
        cambios: hayDiferencias ? cambios : undefined,
        nota: values.nota,
        auditadoEn: new Date(),
        fotos: [],
      });
      await queryClient.invalidateQueries({ queryKey: ['resumen'] });
      await queryClient.invalidateQueries({ queryKey: ['activos'] });
      await queryClient.invalidateQueries({ queryKey: ['activo', activoId] });
      navigation.replace('Confirmacion', {
        resultado: estado,
        titulo: hayDiferencias ? 'Diferencia registrada' : 'Activo confirmado',
        mensaje: hayDiferencias
          ? 'Se guardaron los cambios y quedaron en el histórico de auditoría.'
          : 'No hubo cambios respecto a la ficha original.',
        nombreActivo: activo.nombre,
        placa: activo.placa,
      });
    } catch {
      Alert.alert('Error', 'No se pudo guardar el registro. Intenta de nuevo.');
      setEnviando(false);
    }
  };

  if (!activo) {
    return (
      <SafeAreaView style={styles.loading}>
        <Text>Cargando…</Text>
      </SafeAreaView>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#fff' }}>
      <HeaderBar title="Actualizar activo" subtitle={activo.placa} onBack={() => navigation.goBack()} />

      <ScrollView contentContainerStyle={{ padding: spacing[4], paddingBottom: 120 }}>
        <Text style={styles.sectionLabel}>Estado físico</Text>
        <Controller
          control={control}
          name="estadoFisico"
          render={({ field: { value, onChange } }) => (
            <View style={styles.segmentedRow}>
              {ESTADOS.map((estado) => {
                const selected = value === estado.value;
                return (
                  <Pressable
                    key={estado.value}
                    onPress={() => onChange(estado.value)}
                    style={[
                      styles.segment,
                      selected && { backgroundColor: ESTADO_COLOR[estado.value], borderColor: ESTADO_COLOR[estado.value] },
                    ]}
                  >
                    <Text style={[styles.segmentLabel, selected && { color: '#fff' }]}>{estado.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          )}
        />

        <Text style={styles.sectionLabel}>Ubicación</Text>
        <Controller
          control={control}
          name="ubicacionId"
          render={({ field: { value, onChange } }) => (
            <View style={styles.chipsWrap}>
              {(ubicaciones ?? []).map((u) => (
                <Pressable
                  key={u.id}
                  onPress={() => onChange(u.id)}
                  style={[styles.chip, value === u.id && styles.chipSelected]}
                >
                  <Text style={[styles.chipLabel, value === u.id && styles.chipLabelSelected]}>{u.sede}</Text>
                </Pressable>
              ))}
            </View>
          )}
        />

        <Text style={styles.sectionLabel}>Responsable / custodio</Text>
        <Controller
          control={control}
          name="responsable"
          render={({ field: { value, onChange } }) => (
            <TextInput value={value ?? ''} onChangeText={onChange} style={styles.input} placeholder="Nombre del responsable" />
          )}
        />

        <Text style={styles.sectionLabel}>Centro de costo</Text>
        <Controller
          control={control}
          name="centroCosto"
          render={({ field: { value, onChange } }) => (
            <TextInput value={value ?? ''} onChangeText={onChange} style={styles.input} placeholder="Centro de costo" />
          )}
        />

        <Text style={styles.sectionLabel}>Nota de auditoría</Text>
        <Controller
          control={control}
          name="nota"
          render={({ field: { value, onChange } }) => (
            <TextInput
              value={value}
              onChangeText={onChange}
              style={[styles.input, styles.textarea]}
              placeholder="Describe lo observado durante la auditoría"
              multiline
              numberOfLines={4}
            />
          )}
        />
        {errors.nota && <Text style={styles.errorTexto}>{errors.nota.message}</Text>}
      </ScrollView>

      <SafeAreaView edges={['bottom']} style={styles.acciones}>
        <View style={styles.accionesFila}>
          <View style={{ flex: 1 }}>
            <PrimaryButton label="Cancelar" variant="outline" onPress={() => navigation.goBack()} disabled={enviando} />
          </View>
          <View style={{ flex: 1 }}>
            <PrimaryButton
              label={enviando ? 'Guardando…' : 'Guardar cambios'}
              onPress={() => void handleSubmit(onSubmit)()}
              disabled={enviando}
            />
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  sectionLabel: { fontSize: 13, fontWeight: '600', color: colors.ink[700], marginTop: spacing[4], marginBottom: spacing[2] },
  segmentedRow: { flexDirection: 'row', gap: spacing[2] },
  segment: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.ink[200],
    borderRadius: radius.md,
    paddingVertical: spacing[2] + 2,
    alignItems: 'center',
  },
  segmentLabel: { fontSize: 12, fontWeight: '600', color: colors.ink[700] },
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] },
  chip: {
    borderWidth: 1,
    borderColor: colors.ink[200],
    borderRadius: radius.pill,
    paddingVertical: spacing[2],
    paddingHorizontal: spacing[3],
  },
  chipSelected: { backgroundColor: colors.blue[50], borderColor: colors.brand.blue },
  chipLabel: { fontSize: 12, fontWeight: '600', color: colors.ink[700] },
  chipLabelSelected: { color: colors.brand.blue },
  input: {
    borderWidth: 1,
    borderColor: colors.ink[200],
    borderRadius: radius.md,
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[3],
    fontSize: 14,
  },
  textarea: { minHeight: 80, textAlignVertical: 'top' },
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
  accionesFila: { flexDirection: 'row', gap: spacing[2] },
});
