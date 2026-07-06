import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import * as Crypto from 'expo-crypto';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { CategoriaActivo, EstadoFisico } from '@adn/shared';
import { colors, radius, spacing } from '@adn/ui-tokens';
import { obtenerActivoLocal, listarUbicacionesLocal } from '../db/sync';
import { useProyectoActual } from '../lib/useProyectoActual';
import { useConfiguracionCampos } from '../lib/useConfiguracionCampos';
import { encolarRegistro } from '../lib/registro-offline';
import { calcularReubicacionAutomatica } from '../lib/ubicacion-relocate';
import { useUbicacionActivaStore } from '../lib/ubicacion-activa-store';
import { capturarFoto, eliminarFotoLocal, type FotoCapturada } from '../lib/fotos';
import { HeaderBar } from '../components/HeaderBar';
import { PrimaryButton } from '../components/PrimaryButton';
import { FotosGrid } from '../components/FotosGrid';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Actualizar'>;
type ActivoLocal = NonNullable<Awaited<ReturnType<typeof obtenerActivoLocal>>>['activo'];

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

const CATEGORIAS: { value: CategoriaActivo; label: string }[] = [
  { value: 'EQUIPOS_COMPUTO', label: 'Equipos de cómputo' },
  { value: 'MOBILIARIO', label: 'Mobiliario' },
  { value: 'MAQUINARIA', label: 'Maquinaria' },
  { value: 'VEHICULOS', label: 'Vehículos' },
  { value: 'HERRAMIENTAS', label: 'Herramientas' },
  { value: 'OTRO', label: 'Otro' },
];

/** Campos con su propio widget dedicado más abajo — no se duplican en la sección "dinámica". */
const CAMPOS_CON_WIDGET_PROPIO = new Set(['codigoNuevo', 'estadoFisico', 'ubicacion', 'responsable', 'centroCosto']);

/** Prefijo de clave de `cambios` para campos personalizados — debe coincidir con registros.service.ts (backend). */
const PREFIJO_CAMPO_PERSONALIZADO = 'personalizado:';

function valorActualCampoExtra(activo: ActivoLocal, campo: string): string {
  switch (campo) {
    case 'codigoAnterior':
      return activo.codigoAnterior ?? '';
    case 'codigoControl':
      return activo.codigoControl ?? '';
    case 'nombre':
      return activo.nombre ?? '';
    case 'descripcion':
      return activo.descripcion ?? '';
    case 'color':
      return activo.color ?? '';
    case 'medidas':
      return activo.medidas ?? '';
    case 'capacidad':
      return activo.capacidad ?? '';
    case 'marca':
      return activo.marca ?? '';
    case 'modelo':
      return activo.modelo ?? '';
    case 'serie':
      return activo.serie ?? '';
    case 'categoria':
      return activo.categoria ?? '';
    case 'fechaAdquisicion':
      return activo.fechaAdquisicion ?? '';
    case 'valorLibros':
      return activo.valorLibros ?? '';
    case 'proveedor':
      return activo.proveedor ?? '';
    case 'vidaUtilMeses':
      return activo.vidaUtilMeses != null ? String(activo.vidaUtilMeses) : '';
    default:
      return '';
  }
}

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
  const { campos, camposPersonalizados } = useConfiguracionCampos();
  const [enviando, setEnviando] = useState(false);
  const [fotos, setFotos] = useState<FotoCapturada[]>([]);
  const [valoresExtra, setValoresExtra] = useState<Record<string, string>>({});
  const [valoresExtraOriginales, setValoresExtraOriginales] = useState<Record<string, string>>({});
  const queryClient = useQueryClient();

  const esVisible = (campo: string) => campos.find((c) => c.campo === campo)?.visible ?? true;
  const camposExtra = campos.filter((c) => c.visible && !CAMPOS_CON_WIDGET_PROPIO.has(c.campo));
  const camposPersonalizadosVisibles = camposPersonalizados.filter((cp) => cp.visible);

  const handleCapturarFoto = async (etiqueta: string, orden: number) => {
    const foto = await capturarFoto(etiqueta, orden);
    if (foto) setFotos((prev) => [...prev.filter((f) => f.orden !== orden), foto]);
  };

  const handleQuitarFoto = (orden: number) => {
    const foto = fotos.find((f) => f.orden === orden);
    if (foto) eliminarFotoLocal(foto.clientPhotoId);
    setFotos((prev) => prev.filter((f) => f.orden !== orden));
  };

  const ubicacionActiva = useUbicacionActivaStore((s) => s.ubicacionActiva);

  const { data: resultado } = useQuery({
    queryKey: ['activo-local', activoId],
    queryFn: () => obtenerActivoLocal(activoId),
  });
  const { data: ubicaciones } = useQuery({ queryKey: ['ubicaciones-local'], queryFn: listarUbicacionesLocal });

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
    if (resultado) {
      // Si hay una ubicación activa en la sesión de escaneo y difiere de la guardada,
      // se preselecciona en el chip para que el auditor la vea reflejada antes de enviar
      // (en vez de que sea una sobreescritura silenciosa al guardar).
      const ubicacionPorDefecto =
        ubicacionActiva && ubicacionActiva.id !== resultado.activo.ubicacionId
          ? ubicacionActiva.id
          : resultado.activo.ubicacionId;
      reset({
        estadoFisico: resultado.activo.estadoFisico as FormValues['estadoFisico'],
        ubicacionId: ubicacionPorDefecto,
        responsable: resultado.activo.responsable ?? '',
        centroCosto: resultado.activo.centroCosto ?? '',
        nota: '',
      });

      const extra: Record<string, string> = {};
      for (const c of campos) {
        if (c.visible && !CAMPOS_CON_WIDGET_PROPIO.has(c.campo)) {
          extra[c.campo] = valorActualCampoExtra(resultado.activo, c.campo);
        }
      }
      const valoresPersonalizados: Record<string, string> = resultado.activo.camposPersonalizadosJson
        ? (JSON.parse(resultado.activo.camposPersonalizadosJson) as Record<string, string>)
        : {};
      for (const cp of camposPersonalizados) {
        if (cp.visible) {
          extra[`${PREFIJO_CAMPO_PERSONALIZADO}${cp.id}`] = valoresPersonalizados[cp.id] ?? '';
        }
      }
      setValoresExtra(extra);
      setValoresExtraOriginales(extra);
    }
  }, [resultado, ubicacionActiva, reset, campos, camposPersonalizados]);

  const onSubmit = async (values: FormValues) => {
    if (!proyecto || !resultado) return;
    setEnviando(true);
    const { activo } = resultado;

    const cambios: Record<string, { antes: unknown; despues: unknown }> = {};
    // La reubicación automática (ubicación activa de la sesión) tiene prioridad sobre el
    // picker manual: refleja dónde está parado el auditor, más autoritativo que un valor
    // de formulario que pudo quedarse igual por descuido.
    const reubicacion = calcularReubicacionAutomatica(activo.ubicacionId);
    if (reubicacion) {
      cambios.ubicacionId = reubicacion.ubicacionId;
    } else if (values.ubicacionId !== activo.ubicacionId) {
      cambios.ubicacionId = { antes: activo.ubicacionId, despues: values.ubicacionId };
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

    for (const c of camposExtra) {
      const antes = valoresExtraOriginales[c.campo] ?? '';
      const despues = valoresExtra[c.campo] ?? '';
      if (despues !== antes) {
        cambios[c.campo] = { antes: antes || null, despues: despues.trim() ? despues : null };
      }
    }
    for (const cp of camposPersonalizadosVisibles) {
      const clave = `${PREFIJO_CAMPO_PERSONALIZADO}${cp.id}`;
      const antes = valoresExtraOriginales[clave] ?? '';
      const despues = valoresExtra[clave] ?? '';
      if (despues !== antes) {
        cambios[clave] = { antes, despues };
      }
    }

    const hayDiferencias = Object.keys(cambios).length > 0;
    const estado = hayDiferencias ? 'DIFERENCIA' : 'AUDITADO';

    try {
      await encolarRegistro({
        clientId: Crypto.randomUUID(),
        proyectoId: proyecto.id,
        activoId: activo.id,
        estado,
        estadoFisico: values.estadoFisico,
        cambios: hayDiferencias ? cambios : undefined,
        nota: values.nota,
        auditadoEn: new Date(),
        fotos: fotos.map(({ clientPhotoId, etiqueta, orden, ancho, alto }) => ({
          clientPhotoId,
          etiqueta,
          orden,
          ancho,
          alto,
        })),
        codigoNuevoSnapshot: activo.codigoNuevo,
        nombreSnapshot: activo.nombre,
      });
      void queryClient.invalidateQueries({ queryKey: ['resumen-local'] });
      void queryClient.invalidateQueries({ queryKey: ['activos-local'] });
      void queryClient.invalidateQueries({ queryKey: ['activo-local', activoId] });
      void queryClient.invalidateQueries({ queryKey: ['pendientes-sync'] });
      navigation.replace('Confirmacion', {
        resultado: estado,
        titulo: hayDiferencias ? 'Diferencia registrada' : 'Activo confirmado',
        mensaje: hayDiferencias
          ? 'Se guardaron los cambios y quedaron en el histórico de auditoría.'
          : 'No hubo cambios respecto a la ficha original.',
        nombreActivo: activo.nombre,
        codigo: activo.codigoNuevo,
      });
    } catch {
      Alert.alert('Error', 'No se pudo guardar el registro. Intenta de nuevo.');
      setEnviando(false);
    }
  };

  if (!resultado) {
    return (
      <SafeAreaView style={styles.loading}>
        <Text>Cargando…</Text>
      </SafeAreaView>
    );
  }

  const { activo } = resultado;

  return (
    <View style={{ flex: 1, backgroundColor: '#fff' }}>
      <HeaderBar title="Actualizar activo" subtitle={activo.codigoNuevo} onBack={() => navigation.goBack()} />

      <ScrollView contentContainerStyle={{ padding: spacing[4], paddingBottom: 120 }}>
        {esVisible('estadoFisico') && (
          <>
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
          </>
        )}

        {esVisible('ubicacion') && (
          <>
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
          </>
        )}

        {esVisible('responsable') && (
          <>
            <Text style={styles.sectionLabel}>Responsable / custodio</Text>
            <Controller
              control={control}
              name="responsable"
              render={({ field: { value, onChange } }) => (
                <TextInput value={value ?? ''} onChangeText={onChange} style={styles.input} placeholder="Nombre del responsable" />
              )}
            />
          </>
        )}

        {esVisible('centroCosto') && (
          <>
            <Text style={styles.sectionLabel}>Centro de costo</Text>
            <Controller
              control={control}
              name="centroCosto"
              render={({ field: { value, onChange } }) => (
                <TextInput value={value ?? ''} onChangeText={onChange} style={styles.input} placeholder="Centro de costo" />
              )}
            />
          </>
        )}

        {camposExtra.map((c) =>
          c.campo === 'categoria' ? (
            <View key={c.campo}>
              <Text style={styles.sectionLabel}>{c.etiqueta}</Text>
              <View style={styles.chipsWrap}>
                {CATEGORIAS.map((cat) => (
                  <Pressable
                    key={cat.value}
                    onPress={() => setValoresExtra((v) => ({ ...v, categoria: cat.value }))}
                    style={[styles.chip, valoresExtra.categoria === cat.value && styles.chipSelected]}
                  >
                    <Text style={[styles.chipLabel, valoresExtra.categoria === cat.value && styles.chipLabelSelected]}>
                      {cat.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : (
            <View key={c.campo}>
              <Text style={styles.sectionLabel}>{c.etiqueta}</Text>
              <TextInput
                value={valoresExtra[c.campo] ?? ''}
                onChangeText={(texto) => setValoresExtra((v) => ({ ...v, [c.campo]: texto }))}
                style={styles.input}
                keyboardType={c.tipo === 'number' ? 'numeric' : 'default'}
                placeholder={c.etiqueta}
              />
            </View>
          ),
        )}

        {camposPersonalizadosVisibles.map((cp) => {
          const clave = `${PREFIJO_CAMPO_PERSONALIZADO}${cp.id}`;
          return (
            <View key={cp.id}>
              <Text style={styles.sectionLabel}>
                {cp.etiqueta}
                {cp.requerido && <Text style={{ color: colors.state.danger }}> *</Text>}
              </Text>
              <TextInput
                value={valoresExtra[clave] ?? ''}
                onChangeText={(texto) => setValoresExtra((v) => ({ ...v, [clave]: texto }))}
                style={styles.input}
                placeholder={cp.etiqueta}
              />
            </View>
          );
        })}

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

        <FotosGrid fotos={fotos} onCapturar={handleCapturarFoto} onQuitar={handleQuitarFoto} />
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
