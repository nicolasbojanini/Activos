import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import * as Crypto from 'expo-crypto';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { CategoriaActivo } from '@adn/shared';
import { colors, radius, spacing } from '@adn/ui-tokens';
import { listarUbicacionesLocal } from '../db/sync';
import { encolarRegistro } from '../lib/registro-offline';
import { useUbicacionActivaStore } from '../lib/ubicacion-activa-store';
import { capturarFoto, eliminarFotoLocal, type FotoCapturada } from '../lib/fotos';
import { useProyectoActual } from '../lib/useProyectoActual';
import { HeaderBar } from '../components/HeaderBar';
import { PrimaryButton } from '../components/PrimaryButton';
import { FotosGrid } from '../components/FotosGrid';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'NoRegistrado'>;

const CATEGORIAS: { value: keyof typeof CategoriaActivo; label: string }[] = [
  { value: 'EQUIPOS_COMPUTO', label: 'Equipos de cómputo' },
  { value: 'MOBILIARIO', label: 'Mobiliario' },
  { value: 'MAQUINARIA', label: 'Maquinaria' },
  { value: 'VEHICULOS', label: 'Vehículos' },
  { value: 'HERRAMIENTAS', label: 'Herramientas' },
  { value: 'OTRO', label: 'Otro' },
];

const formSchema = z.object({
  nombre: z.string().min(1, 'Describe el activo encontrado'),
  categoria: z.nativeEnum(CategoriaActivo),
  ubicacionId: z.string().nullable(),
  nota: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

export function NoRegistradoScreen({ route, navigation }: Props) {
  const { codigo } = route.params;
  const { proyecto } = useProyectoActual();
  const [enviando, setEnviando] = useState(false);
  const [fotos, setFotos] = useState<FotoCapturada[]>([]);
  const queryClient = useQueryClient();

  const handleCapturarFoto = async (etiqueta: string, orden: number) => {
    const foto = await capturarFoto(etiqueta, orden);
    if (foto) setFotos((prev) => [...prev.filter((f) => f.orden !== orden), foto]);
  };

  const handleQuitarFoto = (orden: number) => {
    const foto = fotos.find((f) => f.orden === orden);
    if (foto) eliminarFotoLocal(foto.clientPhotoId);
    setFotos((prev) => prev.filter((f) => f.orden !== orden));
  };

  const { data: ubicaciones } = useQuery({ queryKey: ['ubicaciones-local'], queryFn: listarUbicacionesLocal });

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    // Preselecciona la ubicación activa de la sesión de escaneo, si hay una — solo un
    // valor por defecto para el picker, no hay activo previo con el que comparar.
    defaultValues: {
      nombre: '',
      categoria: 'OTRO',
      ubicacionId: useUbicacionActivaStore.getState().ubicacionActiva?.id ?? null,
      nota: '',
    },
  });

  const onSubmit = async (values: FormValues) => {
    if (!proyecto) return;
    setEnviando(true);
    try {
      await encolarRegistro({
        clientId: Crypto.randomUUID(),
        proyectoId: proyecto.id,
        activoId: null,
        estado: 'NO_REGISTRADO',
        cambios: {
          codigoNuevo: { antes: null, despues: codigo },
          nombre: { antes: null, despues: values.nombre },
          categoria: { antes: null, despues: values.categoria },
          ubicacionId: { antes: null, despues: values.ubicacionId },
        },
        nota: values.nota || null,
        auditadoEn: new Date(),
        fotos: fotos.map(({ clientPhotoId, etiqueta, orden, ancho, alto }) => ({
          clientPhotoId,
          etiqueta,
          orden,
          ancho,
          alto,
        })),
        codigoNuevoSnapshot: codigo,
        nombreSnapshot: values.nombre,
      });
      void queryClient.invalidateQueries({ queryKey: ['resumen-local'] });
      void queryClient.invalidateQueries({ queryKey: ['activos-local'] });
      void queryClient.invalidateQueries({ queryKey: ['pendientes-sync'] });
      navigation.replace('Confirmacion', {
        resultado: 'NO_REGISTRADO',
        titulo: 'Activo nuevo registrado',
        mensaje: 'Se creó en el inventario y ya queda auditado.',
        nombreActivo: values.nombre,
        codigo,
      });
    } catch {
      Alert.alert('Error', 'No se pudo guardar el registro. Intenta de nuevo.');
      setEnviando(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#fff' }}>
      <HeaderBar title="Registrar activo no encontrado" subtitle={codigo} onBack={() => navigation.goBack()} />

      <ScrollView contentContainerStyle={{ padding: spacing[4], paddingBottom: 120 }}>
        <Text style={styles.hint}>
          No encontramos un activo con este código en la base de datos. Registra los datos mínimos y quedará dado de
          alta en el inventario de inmediato.
        </Text>

        <Text style={styles.sectionLabel}>Nombre / descripción</Text>
        <Controller
          control={control}
          name="nombre"
          render={({ field: { value, onChange } }) => (
            <TextInput value={value} onChangeText={onChange} style={styles.input} placeholder="Ej. Silla de oficina" />
          )}
        />
        {errors.nombre && <Text style={styles.errorTexto}>{errors.nombre.message}</Text>}

        <Text style={styles.sectionLabel}>Categoría</Text>
        <Controller
          control={control}
          name="categoria"
          render={({ field: { value, onChange } }) => (
            <View style={styles.chipsWrap}>
              {CATEGORIAS.map((c) => (
                <Pressable
                  key={c.value}
                  onPress={() => onChange(c.value)}
                  style={[styles.chip, value === c.value && styles.chipSelected]}
                >
                  <Text style={[styles.chipLabel, value === c.value && styles.chipLabelSelected]}>{c.label}</Text>
                </Pressable>
              ))}
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

        <Text style={styles.sectionLabel}>Nota (opcional)</Text>
        <Controller
          control={control}
          name="nota"
          render={({ field: { value, onChange } }) => (
            <TextInput
              value={value}
              onChangeText={onChange}
              style={[styles.input, styles.textarea]}
              placeholder="Detalles adicionales"
              multiline
              numberOfLines={4}
            />
          )}
        />

        <FotosGrid fotos={fotos} onCapturar={handleCapturarFoto} onQuitar={handleQuitarFoto} />
      </ScrollView>

      <SafeAreaView edges={['bottom']} style={styles.acciones}>
        <PrimaryButton
          label={enviando ? 'Guardando…' : 'Registrar activo'}
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
});
