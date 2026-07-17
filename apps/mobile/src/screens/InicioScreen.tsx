import { memo, useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronRight, CloudOff, MapPin, QrCode, RefreshCw, Search } from 'lucide-react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { colors, radius, spacing } from '@adn/ui-tokens';
import type { CategoriaActivo } from '@adn/shared';
import { getProyecto } from '../lib/services';
import { useAuthStore } from '../lib/auth-store';
import { useUbicacionActivaStore } from '../lib/ubicacion-activa-store';
import { CircularProgress } from '../components/CircularProgress';
import { CategoriaIcon } from '../components/CategoriaIcon';
import { EstadoBadge } from '../components/EstadoBadge';
import { PrimaryButton } from '../components/PrimaryButton';
import {
  actualizarSesionDelta,
  calcularResumenLocal,
  descargarSesion,
  guardarProyectoActivo,
  haySesionDescargada,
  listarActivosLocal,
  obtenerProyectoActivo,
  refrescarConfiguracionCampos,
  type ActivoLocalConEstado,
} from '../db/sync';
import { sincronizarPendientes } from '../lib/registro-offline';
import { useConectividad } from '../lib/useConectividad';
import type { RootStackParamList } from '../navigation/types';

const logoWhite = require('../../assets/adn-logo-white.png');

type Props = NativeStackScreenProps<RootStackParamList, 'Inicio'>;

// Alto FIJO de cada fila (styles.row tiene height explícito, textos con
// numberOfLines={1}): filas uniformes miden más rápido y evitan saltos de
// layout durante el scroll.
const ALTO_FILA = 80;

// Fila memoizada: con miles de activos, re-crear el render de cada fila visible
// cuando cambia cualquier otro estado de la pantalla (KPIs, sync, búsqueda)
// desperdicia frames. memo + onPress estable la aísla de esos re-renders.
const FilaActivo = memo(function FilaActivo({
  item,
  onPress,
}: {
  item: ActivoLocalConEstado;
  onPress: (activoId: string) => void;
}) {
  return (
    <Pressable style={styles.row} onPress={() => onPress(item.id)}>
      <CategoriaIcon categoria={item.categoria as CategoriaActivo} />
      <View style={{ flex: 1, marginLeft: spacing[3] }}>
        <Text style={styles.rowPlaca} numberOfLines={1}>
          {item.codigoAnterior}
        </Text>
        <Text style={styles.rowNombre} numberOfLines={1}>
          {item.nombre}
        </Text>
        <Text style={styles.rowUbicacion} numberOfLines={1}>
          {item.ubicacionSede ?? 'Sin ubicación'}
        </Text>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 4 }}>
        <EstadoBadge estado={item.estado} />
        {item.sinSincronizar && <Text style={styles.sinSyncLabel}>Sin sincronizar</Text>}
      </View>
      <ChevronRight size={18} color={colors.ink[400]} style={{ marginLeft: spacing[2] }} />
    </Pressable>
  );
});

export function InicioScreen({ navigation }: Props) {
  const usuario = useAuthStore((s) => s.usuario);
  const clienteId = useAuthStore((s) => s.clienteId);
  const proyectoId = useAuthStore((s) => s.proyectoId);
  const resolverAsignacionActual = useAuthStore((s) => s.resolverAsignacionActual);
  const ubicacionActiva = useUbicacionActivaStore((s) => s.ubicacionActiva);
  const queryClient = useQueryClient();
  const [q, setQ] = useState('');
  const [qDebounced, setQDebounced] = useState('');
  const [sincronizando, setSincronizando] = useState(false);
  const [errorSesion, setErrorSesion] = useState<string | null>(null);
  const [descargando, setDescargando] = useState(false);

  const confirmarCerrarSesion = () => {
    Alert.alert('Cerrar sesión', '¿Seguro que quieres cerrar tu sesión?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Cerrar sesión', style: 'destructive', onPress: () => void useAuthStore.getState().clear() },
    ]);
  };

  const invalidarLocal = () => {
    void queryClient.invalidateQueries({ queryKey: ['proyecto-local'] });
    void queryClient.invalidateQueries({ queryKey: ['resumen-local'] });
    void queryClient.invalidateQueries({ queryKey: ['activos-local'] });
    void queryClient.invalidateQueries({ queryKey: ['pendientes-sync'] });
  };

  const ejecutarSincronizacion = async () => {
    setSincronizando(true);
    try {
      await sincronizarPendientes();
      invalidarLocal();
    } finally {
      setSincronizando(false);
    }
  };

  const conectado = useConectividad(() => void ejecutarSincronizacion());

  // Bootstrap: intenta refrescar el espejo local con red; si falla y ya había
  // un espejo local previo DEL MISMO proyecto, seguimos con ese (silencioso,
  // es el caso normal de "sin señal en bodega"). Si falla y NO hay espejo
  // local todavía (primera descarga), es un error real que hay que mostrar —
  // antes quedaba tragado en silencio y la pantalla se quedaba en
  // "Cargando…" para siempre sin ninguna pista de qué pasó.
  useEffect(() => {
    if (!clienteId || !proyectoId) return; // sin asignación: el estado vacío se encarga
    async function bootstrap() {
      setErrorSesion(null);
      const proyectoLocal = await obtenerProyectoActivo();
      // Si el espejo local quedó de OTRO proyecto (reasignación del auditor a
      // otro cliente, o dispositivo reutilizado) no sirve como base para un
      // delta ni se puede mostrar: pertenece a otro tenant. Se trata igual
      // que "no hay sesión" y se fuerza una descarga completa del proyecto
      // actual — si no, el delta trae solo lo que cambió y deja mezclados
      // los activos del cliente anterior con los del nuevo.
      const esOtroProyecto = proyectoLocal !== null && proyectoLocal.id !== proyectoId;
      const habiaSesion = !esOtroProyecto && (await haySesionDescargada());
      if (!habiaSesion) setDescargando(true);
      try {
        const proyecto = await getProyecto(proyectoId!);
        if (!habiaSesion) {
          await descargarSesion(proyecto);
        } else {
          await guardarProyectoActivo(proyecto);
          // Delta: trae solo lo que cambió en el servidor desde la última
          // apertura (ediciones web, re-imports, capturas de otros
          // auditores) en vez de re-descargar el inventario completo.
          await Promise.all([refrescarConfiguracionCampos(), actualizarSesionDelta(proyecto)]);
        }
        void queryClient.invalidateQueries({ queryKey: ['proyecto-local'] });
        void queryClient.invalidateQueries({ queryKey: ['resumen-local'] });
        void queryClient.invalidateQueries({ queryKey: ['activos-local'] });
        void queryClient.invalidateQueries({ queryKey: ['pendientes-sync'] });
      } catch (err) {
        if (!habiaSesion) {
          setErrorSesion(err instanceof Error ? err.message : String(err));
        }
        // Si ya había espejo local válido (mismo proyecto), el error se ignora: seguimos con lo descargado antes.
      } finally {
        setDescargando(false);
      }
    }
    void bootstrap();
  }, [clienteId, proyectoId, queryClient]);

  const reintentarDescarga = () => {
    void (async () => {
      setErrorSesion(null);
      setDescargando(true);
      try {
        const proyecto = await getProyecto(proyectoId!);
        await descargarSesion(proyecto);
        invalidarLocal();
      } catch (err) {
        setErrorSesion(err instanceof Error ? err.message : String(err));
      } finally {
        setDescargando(false);
      }
    })();
  };

  // Debounce del buscador: el query de la lista corre 300ms después de la
  // última tecla, no en cada pulsación — teclear rápido ya no dispara una
  // consulta SQLite por letra ni congela el hilo de JS.
  useEffect(() => {
    const timer = setTimeout(() => setQDebounced(q), 300);
    return () => clearTimeout(timer);
  }, [q]);

  const { data: proyecto } = useQuery({ queryKey: ['proyecto-local'], queryFn: obtenerProyectoActivo });
  const { data: resumen } = useQuery({ queryKey: ['resumen-local'], queryFn: calcularResumenLocal });
  const { data: activos, isLoading: activosLoading } = useQuery({
    queryKey: ['activos-local', qDebounced],
    queryFn: () => listarActivosLocal(qDebounced),
    // Mantiene visible el resultado anterior mientras llega el nuevo, en vez
    // de vaciar la lista entre búsquedas.
    placeholderData: (prev) => prev,
  });
  const { data: pendientesSync = 0 } = useQuery({
    queryKey: ['pendientes-sync'],
    queryFn: async () => {
      const { contarPendientesSync } = await import('../db/sync');
      return contarPendientesSync();
    },
  });

  const kpis = [
    { key: 'auditados', label: 'Auditados', value: resumen?.auditados ?? 0, color: colors.state.success },
    { key: 'pendientes', label: 'Pendientes', value: resumen?.pendientes ?? 0, color: colors.ink[500] },
    { key: 'diferencias', label: 'Diferencias', value: resumen?.diferencias ?? 0, color: colors.state.warning },
    { key: 'faltantes', label: 'Faltantes', value: resumen?.faltantes ?? 0, color: colors.state.danger },
  ];

  const totalRevisados = resumen ? resumen.total - resumen.pendientes : 0;

  const abrirDetalle = useCallback(
    (activoId: string) => navigation.navigate('Detalle', { activoId }),
    [navigation],
  );
  const renderItem = useCallback(
    ({ item }: { item: ActivoLocalConEstado }) => <FilaActivo item={item} onPress={abrirDetalle} />,
    [abrirDetalle],
  );

  if (!clienteId) {
    return (
      <View style={styles.vacioContainer}>
        <Text style={styles.vacioTexto}>No tienes un proyecto asignado todavía. Contacta a tu coordinador.</Text>
        <PrimaryButton label="Reintentar" onPress={() => void resolverAsignacionActual()} />
        <PrimaryButton
          label="Cerrar sesión"
          variant="outline"
          onPress={() => void useAuthStore.getState().clear()}
        />
      </View>
    );
  }

  if (errorSesion) {
    return (
      <View style={styles.vacioContainer}>
        <Text style={styles.vacioTexto}>No se pudo descargar la sesión de auditoría.</Text>
        <Text style={styles.vacioTexto}>{errorSesion}</Text>
        <PrimaryButton label="Reintentar" onPress={reintentarDescarga} disabled={descargando} />
        <PrimaryButton
          label="Cerrar sesión"
          variant="outline"
          onPress={() => void useAuthStore.getState().clear()}
        />
      </View>
    );
  }

  if (descargando && !proyecto) {
    return (
      <View style={styles.vacioContainer}>
        <ActivityIndicator size="large" color={colors.brand.blue} />
        <Text style={styles.vacioTexto}>Descargando la base de datos de activos…</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.ink[50] }}>
      <SafeAreaView edges={['top']} style={styles.header}>
        <View style={styles.headerTop}>
          <Image source={logoWhite} style={styles.logo} resizeMode="contain" />
          <Pressable style={styles.avatar} onPress={confirmarCerrarSesion} hitSlop={8}>
            <Text style={styles.avatarLabel}>{usuario?.nombre?.[0]?.toUpperCase() ?? '?'}</Text>
          </Pressable>
        </View>

        <Text style={styles.eyebrow}>SESIÓN DE AUDITORÍA</Text>
        <Text style={styles.proyectoNombre} numberOfLines={2}>
          {proyecto?.nombre ?? 'Cargando…'}
        </Text>

        <View style={styles.avanceCard}>
          <CircularProgress pct={resumen?.pct ?? 0} size={72} strokeWidth={7}>
            <Text style={styles.avancePct}>{resumen ? Math.round(resumen.pct * 100) : 0}%</Text>
          </CircularProgress>
          <View style={{ marginLeft: spacing[4] }}>
            <Text style={styles.avanceLabel}>Avance de la auditoría</Text>
            <Text style={styles.avanceDetalle}>
              {totalRevisados} / {resumen?.total ?? 0} revisados
            </Text>
          </View>
        </View>
      </SafeAreaView>

      {/* Todo lo que va debajo del encabezado azul vive DENTRO del FlatList
          (ListHeaderComponent): en pantallas chicas los KPIs se cortaban
          porque solo la lista scrolleaba — ahora scrollea la pantalla entera.
          Sin getItemLayout a propósito: el alto del header varía (la barra de
          ubicación activa es condicional) y unos offsets desfasados causan
          saltos de scroll peores que medir 200 filas de alto fijo. */}
      <FlatList
        style={{ flex: 1 }}
        data={activos ?? []}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        initialNumToRender={12}
        maxToRenderPerBatch={12}
        windowSize={7}
        removeClippedSubviews
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: 130 }}
        ListHeaderComponent={
          <>
            <View style={styles.syncBar}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}>
                {!conectado && <CloudOff size={14} color={colors.ink[500]} />}
                <Text style={styles.syncTexto}>
                  {!conectado ? 'Sin conexión · ' : ''}
                  {pendientesSync > 0 ? `${pendientesSync} cambios sin sincronizar` : 'Todo sincronizado'}
                </Text>
              </View>
              {pendientesSync > 0 && (
                <Pressable
                  onPress={() => void ejecutarSincronizacion()}
                  style={styles.syncButton}
                  disabled={sincronizando}
                >
                  {sincronizando ? (
                    <ActivityIndicator size="small" color={colors.brand.blue} />
                  ) : (
                    <RefreshCw size={14} color={colors.brand.blue} />
                  )}
                  <Text style={styles.syncButtonLabel}>Sincronizar ahora</Text>
                </Pressable>
              )}
            </View>

            {ubicacionActiva && (
              <View style={styles.ubicacionActivaBar}>
                <MapPin size={14} color={colors.brand.blue} />
                <Text style={styles.ubicacionActivaTexto}>Ubicación activa: {ubicacionActiva.sede}</Text>
              </View>
            )}

            <View style={styles.kpiRow}>
              {kpis.map((kpi) => (
                <View key={kpi.key} style={styles.kpiCard}>
                  <View style={[styles.kpiDot, { backgroundColor: kpi.color }]} />
                  <Text style={styles.kpiValue}>{kpi.value}</Text>
                  <Text style={styles.kpiLabel}>{kpi.label}</Text>
                </View>
              ))}
            </View>

            <View style={styles.searchWrap}>
              <Search size={16} color={colors.ink[400]} />
              <TextInput
                value={q}
                onChangeText={setQ}
                placeholder="Buscar por código, nombre o ubicación"
                style={styles.searchInput}
              />
            </View>
          </>
        }
        ListEmptyComponent={
          <Text style={styles.empty}>
            {activosLoading ? 'Cargando…' : 'No hay activos que coincidan con la búsqueda.'}
          </Text>
        }
      />

      <SafeAreaView edges={['bottom']} style={styles.ctaWrap}>
        <Pressable onPress={() => navigation.navigate('Ubicacion')} style={[styles.ctaButton, styles.ctaButtonOutline]}>
          <MapPin size={20} color={colors.brand.blue} strokeWidth={1.8} />
          <Text style={[styles.ctaLabel, styles.ctaLabelOutline]}>
            {ubicacionActiva ? `Ubicación: ${ubicacionActiva.sede}` : 'Ingresar ubicación'}
          </Text>
        </Pressable>
        <View style={{ height: spacing[2] }} />
        <Pressable onPress={() => navigation.navigate('Escaneo')} style={styles.ctaButton}>
          <QrCode size={20} color="#fff" strokeWidth={1.8} />
          <Text style={styles.ctaLabel}>Escanear código QR</Text>
        </Pressable>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  vacioContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing[6],
    gap: spacing[4],
    backgroundColor: colors.ink[50],
  },
  vacioTexto: { textAlign: 'center', fontSize: 14, color: colors.ink[700] },
  header: {
    backgroundColor: colors.brand.blue,
    paddingHorizontal: spacing[4],
    paddingBottom: spacing[6],
  },
  headerTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing[2] },
  logo: { width: 90, height: 20, tintColor: '#fff' },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLabel: { color: '#fff', fontWeight: '600', fontSize: 13 },
  eyebrow: {
    marginTop: spacing[6],
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1.5,
    color: 'rgba(255,255,255,0.75)',
  },
  proyectoNombre: { fontSize: 20, fontWeight: '600', color: '#fff', marginTop: spacing[1], marginBottom: spacing[4] },
  avanceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: radius.lg,
    padding: spacing[4],
  },
  avancePct: { color: '#fff', fontWeight: '700', fontSize: 16 },
  avanceLabel: { color: '#fff', fontWeight: '600', fontSize: 13, marginBottom: spacing[1] },
  avanceDetalle: { color: 'rgba(255,255,255,0.75)', fontSize: 12 },
  syncBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing[4],
    marginTop: spacing[3],
    marginBottom: spacing[2],
  },
  syncTexto: { fontSize: 12, color: colors.ink[500], fontWeight: '600' },
  syncButton: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  syncButtonLabel: { fontSize: 12, fontWeight: '600', color: colors.brand.blue },
  ubicacionActivaBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    marginHorizontal: spacing[4],
    marginBottom: spacing[3],
    backgroundColor: colors.blue[50],
    borderRadius: radius.md,
    paddingVertical: spacing[2],
    paddingHorizontal: spacing[3],
  },
  ubicacionActivaTexto: { fontSize: 12, fontWeight: '600', color: colors.brand.blue },
  kpiRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[2],
    paddingHorizontal: spacing[4],
    marginBottom: spacing[3],
  },
  kpiCard: {
    flexBasis: '48%',
    flexGrow: 1,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: colors.ink[200],
    borderRadius: radius.md,
    padding: spacing[3],
  },
  kpiDot: { width: 8, height: 8, borderRadius: 4, marginBottom: spacing[2] },
  kpiValue: { fontSize: 20, fontWeight: '700', color: colors.brand.black },
  kpiLabel: { fontSize: 12, color: colors.ink[500] },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    marginHorizontal: spacing[4],
    marginBottom: spacing[3],
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: colors.ink[200],
    borderRadius: radius.md,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2] + 2,
  },
  searchInput: { flex: 1, fontSize: 14 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: radius.lg,
    padding: spacing[3],
    height: ALTO_FILA,
    marginBottom: spacing[2],
    marginHorizontal: spacing[4],
    shadowColor: '#0B2E4F',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  rowPlaca: { fontFamily: 'monospace', color: colors.brand.blue, fontWeight: '600', fontSize: 13 },
  rowNombre: { fontSize: 14, fontWeight: '600', color: colors.brand.black, marginTop: 1 },
  rowUbicacion: { fontSize: 12, color: colors.ink[500], marginTop: 1 },
  sinSyncLabel: { fontSize: 10, fontWeight: '600', color: colors.state.warning },
  empty: { textAlign: 'center', color: colors.ink[500], marginTop: spacing[6] },
  ctaWrap: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.ink[50],
    paddingHorizontal: spacing[4],
    paddingTop: spacing[2],
  },
  ctaButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[2],
    backgroundColor: colors.brand.blue,
    borderRadius: radius.md,
    paddingVertical: spacing[3] + 2,
    shadowColor: colors.brand.blue,
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  ctaLabel: { color: '#fff', fontWeight: '600', fontSize: 14 },
  ctaButtonOutline: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: colors.brand.blue,
    shadowOpacity: 0,
    elevation: 0,
  },
  ctaLabelOutline: { color: colors.brand.blue },
});
