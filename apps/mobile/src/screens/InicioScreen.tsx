import { memo, useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronRight, CloudOff, MapPin, PlusCircle, RefreshCw, Search, Share2 } from 'lucide-react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { colors, radius, spacing } from '@adn/ui-tokens';
import type { CategoriaActivo, ProyectoOutput } from '@adn/shared';
import { getProyecto } from '../lib/services';
import { useAuthStore } from '../lib/auth-store';
import { CLAVE_UBICACION_BASE, exigirUbicacionActiva, useUbicacionActivaStore } from '../lib/ubicacion-activa-store';
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
import { exportarPendientes } from '../lib/exportar-pendientes';
import {
  descartarPeticionCarpetaPublica,
  obtenerCarpetaPublicaUri,
  pedirCarpetaPublica,
  yaSePidioCarpetaPublica,
} from '../lib/carpeta-publica';
import { abrirDescargaActualizacion, verificarActualizacion } from '../lib/actualizacion';
import { useConectividad } from '../lib/useConectividad';
import { CLAVE_SUGERENCIAS } from '../lib/useSugerencias';
import type { RootStackParamList } from '../navigation/types';

const logoWhite = require('../../assets/adn-logo-white.png');

type Props = NativeStackScreenProps<RootStackParamList, 'Inicio'>;

// Alto FIJO de cada fila (styles.row tiene height explícito, textos con
// numberOfLines={1}): filas uniformes miden más rápido y evitan saltos de
// layout durante el scroll.
const ALTO_FILA = 80;

/** Activos auditados sin carpeta pública configurada antes de repetir el aviso, esta vez bloqueante. */
const UMBRAL_ESCALADA_CARPETA_PUBLICA = 20;

/**
 * Número de build legible para verificar por teléfono que todo el equipo
 * tiene la misma versión instalada — sube 1 por cada build de CI
 * (EXPO_PUBLIC_BUILD_NUMBER = github.run_number, ver build-android-apk.yml),
 * a diferencia del hash de commit que usa actualizacion.ts (útil para
 * comparar contra GitHub, inútil para preguntar "qué número ves"). El "1."
 * es la versión mayor de app.json — actualizar acá si esa cambia.
 */
const VERSION_APP = `v1.${process.env.EXPO_PUBLIC_BUILD_NUMBER ?? 'dev'}`;

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
  const [exportando, setExportando] = useState(false);
  const [errorSesion, setErrorSesion] = useState<string | null>(null);
  const [descargando, setDescargando] = useState(false);
  const [refrescando, setRefrescando] = useState(false);

  const confirmarCerrarSesion = () => {
    Alert.alert('Cerrar sesión', '¿Seguro que quieres cerrar tu sesión?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Cerrar sesión', style: 'destructive', onPress: () => void useAuthStore.getState().clear() },
    ]);
  };

  const invalidarLocal = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['proyecto-local'] });
    void queryClient.invalidateQueries({ queryKey: ['resumen-local'] });
    void queryClient.invalidateQueries({ queryKey: ['activos-local'] });
    void queryClient.invalidateQueries({ queryKey: ['pendientes-sync'] });
    void queryClient.invalidateQueries({ queryKey: ['fotos-pendientes'] });
    // El espejo cambió: las sugerencias dinámicas se recalculan (se cachean
    // indefinidamente justo porque solo dependen del espejo).
    void queryClient.invalidateQueries({ queryKey: [CLAVE_SUGERENCIAS] });
  }, [queryClient]);

  const ejecutarSincronizacion = useCallback(async () => {
    setSincronizando(true);
    try {
      await sincronizarPendientes();
      invalidarLocal();
    } finally {
      setSincronizando(false);
    }
  }, [invalidarLocal]);

  // Fallback para sitios sin señal en absoluto: exporta la cola pendiente a
  // un .xlsx para transportar a mano a una PC con red. No toca la cola local
  // ni la marca como sincronizada — sigue intentando sincronizar normal en
  // cuanto haya señal, sin riesgo de duplicar nada (crearRegistro es
  // idempotente por clientId).
  const ejecutarExportacion = async () => {
    setExportando(true);
    try {
      const resultado = await exportarPendientes();
      if (!resultado) {
        Alert.alert('Nada que exportar', 'No hay cambios pendientes de sincronizar.');
      } else if (resultado.errorZip) {
        Alert.alert(
          'El Excel se exportó, pero el zip de fotos falló',
          `Los cambios ya están en el Excel exportado. Las fotos no se pudieron empaquetar: ${resultado.errorZip}`,
        );
      } else if (resultado.fotosEncontradas < resultado.fotosReferenciadas) {
        const faltan = resultado.fotosReferenciadas - resultado.fotosEncontradas;
        Alert.alert(
          'Faltan fotos en el zip',
          `${faltan} de ${resultado.fotosReferenciadas} fotos no se pudieron incluir en el zip. El detalle queda en "_fotos_no_encontradas.txt" dentro del propio zip.`,
        );
      }
    } catch {
      Alert.alert('No se pudo exportar', 'Intenta de nuevo.');
    } finally {
      setExportando(false);
    }
  };

  const conectado = useConectividad(() => void ejecutarSincronizacion());

  // Con señal mala/intermitente, la transición offline→online de NetInfo casi
  // nunca se dispara (la conexión no llega a caerse del todo) — sin esto, el
  // único disparador automático de sync quedaba en manos del auditor
  // acordándose de tocar "Sincronizar ahora". Reintentar cada vez que la app
  // vuelve a primer plano (incluida la vuelta de la cámara nativa tras cada
  // foto) cubre ese caso sin costo real: sincronizarPendientes ya vuelve
  // rápido cuando no hay nada pendiente.
  useEffect(() => {
    const suscripcion = AppState.addEventListener('change', (siguiente) => {
      if (siguiente === 'active') void ejecutarSincronizacion();
    });
    return () => suscripcion.remove();
  }, [ejecutarSincronizacion]);

  // Delta: trae solo lo que cambió en el servidor desde la última sincronización
  // (ediciones web, re-imports, capturas de otros auditores) en vez de
  // re-descargar el inventario completo. Corre al abrir la app (bootstrap) y
  // también a mano con "deslizar para actualizar" — nunca automáticamente por
  // cada activo que se abre, porque eso sí sería lento con inventarios grandes.
  const aplicarDeltaSesion = async (proyectoActual: ProyectoOutput) => {
    await guardarProyectoActivo(proyectoActual);
    await Promise.all([refrescarConfiguracionCampos(), actualizarSesionDelta(proyectoActual)]);
  };

  const onRefresh = async () => {
    if (!proyectoId) return;
    setRefrescando(true);
    try {
      await sincronizarPendientes();
      const proyectoActual = await getProyecto(proyectoId);
      await aplicarDeltaSesion(proyectoActual);
      invalidarLocal();
    } catch {
      // Deslizar para actualizar es una acción explícita y de bajo riesgo: si
      // falla (sin señal, timeout) la lista sigue mostrando el espejo local tal
      // cual estaba, sin alertas invasivas — el usuario puede volver a intentar.
    } finally {
      setRefrescando(false);
    }
  };

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
          await aplicarDeltaSesion(proyecto);
        }
        void queryClient.invalidateQueries({ queryKey: ['proyecto-local'] });
        void queryClient.invalidateQueries({ queryKey: ['resumen-local'] });
        void queryClient.invalidateQueries({ queryKey: ['activos-local'] });
        void queryClient.invalidateQueries({ queryKey: ['pendientes-sync'] });
        void queryClient.invalidateQueries({ queryKey: ['fotos-pendientes'] });
        void queryClient.invalidateQueries({ queryKey: [CLAVE_SUGERENCIAS] });
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
  // Registros que ya se guardaron en el servidor pero cuyas fotos todavía no
  // terminaron de subir — se cuentan aparte para no mostrarlos como
  // "pendientes" (que suena a "no se guardó nada").
  const { data: fotosPendientes = 0 } = useQuery({
    queryKey: ['fotos-pendientes'],
    queryFn: async () => {
      const { contarFotosPendientes } = await import('../db/sync');
      return contarFotosPendientes();
    },
  });

  // La carpeta pública es donde el respaldo de fotos y los exports de
  // pendientes quedan visibles conectando el celular por USB (ver
  // carpeta-publica.ts) — el almacenamiento interno de la app no lo es. Se
  // pide una sola vez, con explicación, apenas hay sesión; si el auditor la
  // ignora queda disponible el enlace manual de abajo.
  const { data: carpetaPublicaUri } = useQuery({
    queryKey: ['carpeta-publica'],
    queryFn: obtenerCarpetaPublicaUri,
  });

  // Aviso de actualización manual: revisa contra el último GitHub Release
  // publicado por CI (ver actualizacion.ts) — no descarga ni instala sola,
  // solo avisa. staleTime largo: no tiene sentido pegarle a la API de
  // GitHub más de un par de veces al día por dispositivo.
  const { data: actualizacion } = useQuery({
    queryKey: ['actualizacion'],
    queryFn: verificarActualizacion,
    staleTime: 1000 * 60 * 60 * 6,
  });

  const solicitarCarpetaPublica = () => {
    Alert.alert(
      'Elige una carpeta de respaldo',
      'Para poder recuperar tus fotos conectando el celular a una PC por USB si algo falla, elige dónde guardarlas — se recomienda "Download" o "Descargas".',
      [
        {
          text: 'Ahora no',
          style: 'cancel',
          onPress: () => void descartarPeticionCarpetaPublica(),
        },
        {
          text: 'Elegir carpeta',
          onPress: () =>
            void (async () => {
              const uri = await pedirCarpetaPublica();
              if (uri) void queryClient.invalidateQueries({ queryKey: ['carpeta-publica'] });
            })(),
        },
      ],
    );
  };

  useEffect(() => {
    if (!clienteId) return;
    void (async () => {
      if (await yaSePidioCarpetaPublica()) return;
      solicitarCarpetaPublica();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clienteId]);

  // El aviso inicial de arriba es descartable con un toque y fácil de perder
  // en el apuro del primer día (ver incidente Decameron DMZ 00465-00476,
  // agosto 2026) — sin carpeta configurada, el respaldo local cae en
  // silencio al almacenamiento interno, que no se puede rescatar por USB si
  // el sync nunca termina. Pasado el umbral de activos auditados sin haber
  // elegido carpeta, se repite el aviso una vez por sesión, esta vez sin
  // poder descartarlo tocando afuera — para que quede claro que no es un
  // detalle menor.
  const [escaladaCarpetaMostrada, setEscaladaCarpetaMostrada] = useState(false);
  useEffect(() => {
    if (carpetaPublicaUri || escaladaCarpetaMostrada) return;
    if ((resumen?.auditados ?? 0) < UMBRAL_ESCALADA_CARPETA_PUBLICA) return;
    setEscaladaCarpetaMostrada(true);
    Alert.alert(
      'Configura la carpeta de respaldo',
      `Ya auditaste ${resumen!.auditados} activos sin elegir dónde respaldar las fotos por USB. Si el celular pasa mucho tiempo sin señal, es la única forma de rescatarlas a mano.`,
      [
        { text: 'Más tarde', style: 'cancel' },
        {
          text: 'Elegir carpeta',
          onPress: () =>
            void (async () => {
              const uri = await pedirCarpetaPublica();
              if (uri) void queryClient.invalidateQueries({ queryKey: ['carpeta-publica'] });
            })(),
        },
      ],
      { cancelable: false },
    );
  }, [resumen, carpetaPublicaUri, escaladaCarpetaMostrada, queryClient]);

  const kpis = [
    { key: 'auditados', label: 'Auditados', value: resumen?.auditados ?? 0, color: colors.state.success },
    { key: 'pendientes', label: 'Pendientes', value: resumen?.pendientes ?? 0, color: colors.ink[500] },
    { key: 'diferencias', label: 'Diferencias', value: resumen?.diferencias ?? 0, color: colors.state.warning },
    { key: 'faltantes', label: 'Faltantes', value: resumen?.faltantes ?? 0, color: colors.state.danger },
  ];

  const totalRevisados = resumen ? resumen.total - resumen.pendientes : 0;

  // El lector de mano escribe el código directo en el buscador — si ninguno de
  // los resultados coincide EXACTO con lo escrito (aunque haya coincidencias
  // parciales, como "MZ 00021" trayendo "DMA 01157" por compartir texto), se
  // ofrece crear el activo. Antes solo se ofrecía con la lista totalmente
  // vacía, así que un código real pero no existente que traía coincidencias
  // aproximadas dejaba al auditor sin forma de darlo de alta desde acá.
  const qNormalizado = qDebounced.trim().toLowerCase();
  const hayCoincidenciaExacta = (activos ?? []).some(
    (a) => a.codigoAnterior.toLowerCase() === qNormalizado || a.codigoNuevo.toLowerCase() === qNormalizado,
  );
  const mostrarCrearActivo = qNormalizado.length > 0 && !activosLoading && !hayCoincidenciaExacta;

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

        <Text style={styles.versionTexto}>{VERSION_APP}</Text>
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
        refreshControl={
          <RefreshControl refreshing={refrescando} onRefresh={() => void onRefresh()} tintColor={colors.brand.blue} />
        }
        ListHeaderComponent={
          <>
            <View style={styles.syncBar}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}>
                {!conectado && <CloudOff size={14} color={colors.ink[500]} />}
                <Text style={styles.syncTexto}>
                  {!conectado ? 'Sin conexión · ' : ''}
                  {pendientesSync > 0
                    ? `${pendientesSync} cambios sin sincronizar`
                    : fotosPendientes > 0
                      ? `${fotosPendientes} fotos por subir`
                      : 'Todo sincronizado'}
                </Text>
              </View>
              {(pendientesSync > 0 || fotosPendientes > 0) && (
                <View style={{ flexDirection: 'row', gap: spacing[3] }}>
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
                  {pendientesSync > 0 && (
                    <Pressable
                      onPress={() => void ejecutarExportacion()}
                      style={styles.syncButton}
                      disabled={exportando}
                    >
                      {exportando ? (
                        <ActivityIndicator size="small" color={colors.brand.blue} />
                      ) : (
                        <Share2 size={14} color={colors.brand.blue} />
                      )}
                      <Text style={styles.syncButtonLabel}>Exportar pendientes</Text>
                    </Pressable>
                  )}
                </View>
              )}
            </View>

            {actualizacion?.disponible && actualizacion.urlDescarga && (
              <Pressable
                style={styles.actualizacionBar}
                onPress={() => abrirDescargaActualizacion(actualizacion.urlDescarga!)}
              >
                <RefreshCw size={14} color="#fff" />
                <Text style={styles.actualizacionTexto}>Hay una actualización disponible — toca para descargarla</Text>
              </Pressable>
            )}

            {ubicacionActiva && (
              <View style={styles.ubicacionActivaBar}>
                <MapPin size={14} color={colors.brand.blue} />
                <Text style={styles.ubicacionActivaTexto}>Ubicación activa: {ubicacionActiva[CLAVE_UBICACION_BASE]}</Text>
              </View>
            )}

            {!carpetaPublicaUri && (
              <Pressable style={styles.carpetaPublicaBar} onPress={solicitarCarpetaPublica}>
                <Text style={styles.carpetaPublicaTexto}>Configurar carpeta de respaldo (visible por USB)</Text>
              </Pressable>
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
          activosLoading ? (
            <Text style={styles.empty}>Cargando…</Text>
          ) : (
            <Text style={styles.empty}>No hay activos que coincidan con la búsqueda.</Text>
          )
        }
        ListFooterComponent={
          mostrarCrearActivo ? (
            <Pressable
              style={styles.crearActivoBtn}
              onPress={() => {
                if (!exigirUbicacionActiva(navigation)) return;
                navigation.navigate('NoRegistrado', { codigo: qDebounced.trim() });
              }}
            >
              <PlusCircle size={16} color={colors.brand.blue} strokeWidth={1.8} />
              <Text style={styles.crearActivoLabel}>Crear activo con código «{qDebounced.trim()}»</Text>
            </Pressable>
          ) : null
        }
      />

      <SafeAreaView edges={['bottom']} style={styles.ctaWrap}>
        <Pressable onPress={() => navigation.navigate('Ubicacion')} style={styles.ctaButton}>
          <MapPin size={20} color="#fff" strokeWidth={1.8} />
          <Text style={styles.ctaLabel}>
            {ubicacionActiva ? `Ubicación: ${ubicacionActiva[CLAVE_UBICACION_BASE]}` : 'Ingresar ubicación'}
          </Text>
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
  versionTexto: {
    marginTop: spacing[2],
    fontSize: 10,
    color: 'rgba(255,255,255,0.5)',
  },
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
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing[2],
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
  actualizacionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    marginHorizontal: spacing[4],
    marginBottom: spacing[3],
    backgroundColor: colors.state.warning,
    borderRadius: radius.md,
    paddingVertical: spacing[2],
    paddingHorizontal: spacing[3],
  },
  actualizacionTexto: { fontSize: 12, fontWeight: '600', color: '#fff', flexShrink: 1 },
  carpetaPublicaBar: {
    marginHorizontal: spacing[4],
    marginBottom: spacing[3],
    paddingVertical: spacing[2],
    paddingHorizontal: spacing[3],
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.ink[200],
    borderStyle: 'dashed',
  },
  carpetaPublicaTexto: { fontSize: 12, fontWeight: '600', color: colors.ink[500], textAlign: 'center' },
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
  crearActivoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[2],
    marginTop: spacing[4],
    marginHorizontal: spacing[6],
    paddingVertical: spacing[3],
    borderWidth: 1,
    borderColor: colors.brand.blue,
    borderRadius: radius.md,
  },
  crearActivoLabel: { color: colors.brand.blue, fontWeight: '600', fontSize: 13 },
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
});
