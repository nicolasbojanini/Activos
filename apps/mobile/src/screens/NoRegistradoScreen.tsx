import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import * as Crypto from 'expo-crypto';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { CategoriaActivo, EstadoFisico } from '@adn/shared';
import { colors, radius, spacing } from '@adn/ui-tokens';
import { encolarRegistro } from '../lib/registro-offline';
import { useUbicacionActivaStore } from '../lib/ubicacion-activa-store';
import { useConfiguracionCampos } from '../lib/useConfiguracionCampos';
import { useProyectoActual } from '../lib/useProyectoActual';
import { capturarFoto, eliminarFotoLocal, type FotoCapturada } from '../lib/fotos';
import { HeaderBar } from '../components/HeaderBar';
import { PrimaryButton } from '../components/PrimaryButton';
import { FotosGrid, ORDEN_FOTO_OBLIGATORIA } from '../components/FotosGrid';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'NoRegistrado'>;

const CATEGORIAS: { value: CategoriaActivo; label: string }[] = [
  { value: 'EQUIPOS_COMPUTO', label: 'Equipos de cómputo' },
  { value: 'MOBILIARIO', label: 'Mobiliario' },
  { value: 'MAQUINARIA', label: 'Maquinaria' },
  { value: 'VEHICULOS', label: 'Vehículos' },
  { value: 'HERRAMIENTAS', label: 'Herramientas' },
  { value: 'OTRO', label: 'Otro' },
];

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

// nombre y categoria tienen su propio widget SIEMPRE visible y obligatorio,
// sin importar la configuración del cliente: el backend los exige para dar
// de alta un activo nuevo (ver crearActivoDesdeHallazgo). codigoAnterior es
// el código ya escaneado, fijo, tampoco pasa por la sección dinámica.
const CAMPOS_CON_WIDGET_PROPIO = new Set([
  'codigoAnterior',
  'nombre',
  'categoria',
  'estadoFisico',
  'ubicacion',
  'responsable',
  'centroCosto',
]);

/** Prefijo de clave de `cambios` para campos personalizados — debe coincidir con registros.service.ts (backend). */
const PREFIJO_CAMPO_PERSONALIZADO = 'personalizado:';

export function NoRegistradoScreen({ route, navigation }: Props) {
  const { codigo } = route.params;
  const { proyecto } = useProyectoActual();
  const { campos, camposPersonalizados } = useConfiguracionCampos();
  const ubicacionActiva = useUbicacionActivaStore((s) => s.ubicacionActiva);
  const [enviando, setEnviando] = useState(false);
  const [fotos, setFotos] = useState<FotoCapturada[]>([]);
  const [nombre, setNombre] = useState('');
  const [categoria, setCategoria] = useState<CategoriaActivo>('OTRO');
  const [estadoFisico, setEstadoFisico] = useState<keyof typeof EstadoFisico>('BUENO');
  const [ubicacionTexto, setUbicacionTexto] = useState(ubicacionActiva?.sede ?? '');
  const [responsable, setResponsable] = useState('');
  const [centroCosto, setCentroCosto] = useState('');
  const [nota, setNota] = useState('');
  const [valoresExtra, setValoresExtra] = useState<Record<string, string>>({});
  const queryClient = useQueryClient();

  const esVisible = (campo: string) => campos.find((c) => c.campo === campo)?.visible ?? true;
  const esRequerido = (campo: string) => campos.find((c) => c.campo === campo)?.requerido ?? false;
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

  const onSubmit = async () => {
    if (!proyecto) return;

    const vacio = (valor: string | null | undefined) => valor == null || valor.trim() === '';
    const faltantes: string[] = [];
    if (vacio(nombre)) faltantes.push('Nombre');
    if (vacio(categoria)) faltantes.push('Categoría');
    for (const c of campos) {
      if (!c.visible || !c.requerido || CAMPOS_CON_WIDGET_PROPIO.has(c.campo)) continue;
      if (vacio(valoresExtra[c.campo])) faltantes.push(c.etiqueta);
    }
    if (esVisible('estadoFisico') && esRequerido('estadoFisico') && vacio(estadoFisico)) faltantes.push('Estado');
    if (esVisible('ubicacion') && esRequerido('ubicacion') && vacio(ubicacionTexto)) faltantes.push('Ubicación');
    if (esVisible('responsable') && esRequerido('responsable') && vacio(responsable)) faltantes.push('Responsable');
    if (esVisible('centroCosto') && esRequerido('centroCosto') && vacio(centroCosto)) faltantes.push('Centro de costo');
    for (const cp of camposPersonalizadosVisibles) {
      if (!cp.requerido) continue;
      if (vacio(valoresExtra[`${PREFIJO_CAMPO_PERSONALIZADO}${cp.id}`])) faltantes.push(cp.etiqueta);
    }
    if (!fotos.some((f) => f.orden === ORDEN_FOTO_OBLIGATORIA)) faltantes.push('Foto: vista general');
    if (faltantes.length > 0) {
      Alert.alert('Completa los campos obligatorios', faltantes.join(', '));
      return;
    }

    setEnviando(true);
    try {
      // Activo recién creado: todo lo que llegue con valor va en `cambios`
      // con antes=null — es el mismo diff genérico que usa registros.service.ts
      // para aplicar el resto de campos sobre el Activo apenas se crea.
      const cambios: Record<string, { antes: unknown; despues: unknown }> = {
        codigoAnterior: { antes: null, despues: codigo },
        nombre: { antes: null, despues: nombre.trim() },
        categoria: { antes: null, despues: categoria },
      };
      if (esVisible('estadoFisico')) cambios.estadoFisico = { antes: null, despues: estadoFisico };
      if (ubicacionTexto.trim()) cambios.ubicacionNombre = { antes: null, despues: ubicacionTexto.trim() };
      if (responsable.trim()) cambios.responsable = { antes: null, despues: responsable.trim() };
      if (centroCosto.trim()) cambios.centroCosto = { antes: null, despues: centroCosto.trim() };
      for (const c of camposExtra) {
        const valor = valoresExtra[c.campo];
        if (valor?.trim()) cambios[c.campo] = { antes: null, despues: valor.trim() };
      }
      for (const cp of camposPersonalizadosVisibles) {
        const clave = `${PREFIJO_CAMPO_PERSONALIZADO}${cp.id}`;
        const valor = valoresExtra[clave];
        if (valor?.trim()) cambios[clave] = { antes: null, despues: valor.trim() };
      }

      await encolarRegistro({
        clientId: Crypto.randomUUID(),
        proyectoId: proyecto.id,
        activoId: null,
        estado: 'NO_REGISTRADO',
        cambios,
        nota: nota.trim() || null,
        auditadoEn: new Date(),
        fotos: fotos.map(({ clientPhotoId, etiqueta, orden, ancho, alto }) => ({
          clientPhotoId,
          etiqueta,
          orden,
          ancho,
          alto,
        })),
        codigoAnteriorSnapshot: codigo,
        nombreSnapshot: nombre.trim(),
      });
      void queryClient.invalidateQueries({ queryKey: ['resumen-local'] });
      void queryClient.invalidateQueries({ queryKey: ['activos-local'] });
      void queryClient.invalidateQueries({ queryKey: ['pendientes-sync'] });
      navigation.replace('Confirmacion', {
        resultado: 'NO_REGISTRADO',
        titulo: 'Activo nuevo registrado',
        mensaje: 'Se creó en el inventario y ya queda auditado.',
        nombreActivo: nombre.trim(),
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
          No encontramos un activo con este código en la base de datos. Completa su ficha y quedará dado de alta en
          el inventario, ya auditado.
        </Text>

        <Text style={styles.sectionLabel}>
          Nombre / descripción
          <Text style={{ color: colors.state.danger }}> *</Text>
        </Text>
        <TextInput value={nombre} onChangeText={setNombre} style={styles.input} placeholder="Ej. Silla de oficina" />

        <Text style={styles.sectionLabel}>
          Categoría
          <Text style={{ color: colors.state.danger }}> *</Text>
        </Text>
        <View style={styles.chipsWrap}>
          {CATEGORIAS.map((c) => (
            <Pressable
              key={c.value}
              onPress={() => setCategoria(c.value)}
              style={[styles.chip, categoria === c.value && styles.chipSelected]}
            >
              <Text style={[styles.chipLabel, categoria === c.value && styles.chipLabelSelected]}>{c.label}</Text>
            </Pressable>
          ))}
        </View>

        {esVisible('estadoFisico') && (
          <>
            <Text style={styles.sectionLabel}>
              Estado físico
              {esRequerido('estadoFisico') && <Text style={{ color: colors.state.danger }}> *</Text>}
            </Text>
            <View style={styles.segmentedRow}>
              {ESTADOS.map((estado) => {
                const selected = estadoFisico === estado.value;
                return (
                  <Pressable
                    key={estado.value}
                    onPress={() => setEstadoFisico(estado.value)}
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
          </>
        )}

        {esVisible('ubicacion') && (
          <>
            <Text style={styles.sectionLabel}>
              Ubicación
              {esRequerido('ubicacion') && <Text style={{ color: colors.state.danger }}> *</Text>}
            </Text>
            <TextInput
              value={ubicacionTexto}
              onChangeText={setUbicacionTexto}
              style={styles.input}
              placeholder="Ej. Bodega Norte, piso 2"
            />
          </>
        )}

        {esVisible('responsable') && (
          <>
            <Text style={styles.sectionLabel}>
              Responsable / custodio
              {esRequerido('responsable') && <Text style={{ color: colors.state.danger }}> *</Text>}
            </Text>
            <TextInput value={responsable} onChangeText={setResponsable} style={styles.input} placeholder="Nombre del responsable" />
          </>
        )}

        {esVisible('centroCosto') && (
          <>
            <Text style={styles.sectionLabel}>
              Centro de costo
              {esRequerido('centroCosto') && <Text style={{ color: colors.state.danger }}> *</Text>}
            </Text>
            <TextInput value={centroCosto} onChangeText={setCentroCosto} style={styles.input} placeholder="Centro de costo" />
          </>
        )}

        {camposExtra.map((c) => (
          <View key={c.campo}>
            <Text style={styles.sectionLabel}>
              {c.etiqueta}
              {c.requerido && <Text style={{ color: colors.state.danger }}> *</Text>}
            </Text>
            <TextInput
              value={valoresExtra[c.campo] ?? ''}
              onChangeText={(texto) => setValoresExtra((v) => ({ ...v, [c.campo]: texto }))}
              style={styles.input}
              keyboardType={c.tipo === 'number' ? 'numeric' : 'default'}
              placeholder={c.etiqueta}
            />
          </View>
        ))}

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

        <Text style={styles.sectionLabel}>Nota (opcional)</Text>
        <TextInput
          value={nota}
          onChangeText={setNota}
          style={[styles.input, styles.textarea]}
          placeholder="Detalles adicionales"
          multiline
          numberOfLines={4}
        />

        <FotosGrid fotos={fotos} onCapturar={handleCapturarFoto} onQuitar={handleQuitarFoto} />
      </ScrollView>

      <SafeAreaView edges={['bottom']} style={styles.acciones}>
        <PrimaryButton label={enviando ? 'Guardando…' : 'Registrar activo'} onPress={() => void onSubmit()} disabled={enviando} />
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  hint: { fontSize: 13, color: colors.ink[500], marginBottom: spacing[4], lineHeight: 18 },
  sectionLabel: { fontSize: 13, fontWeight: '600', color: colors.ink[700], marginTop: spacing[3], marginBottom: spacing[2] },
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
