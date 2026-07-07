# Plan de optimización de rendimiento — App Android (ADN Auditoría)

> Audiencia: desarrollador junior. Cada tarea indica archivos exactos, código de ejemplo,
> cómo verificar el resultado y qué riesgos vigilar. Sigue las fases en orden — están
> priorizadas por impacto ÷ esfuerzo. No mezcles varias tareas en un mismo commit.

## Contexto del diagnóstico

La app maneja un espejo local SQLite de **7.398 activos** (cliente Decameron) en teléfonos
de gama media. Los problemas reportados en campo: descarga inicial lenta (2-3 min), la app
"se siente lenta", mensajes de "la aplicación no responde" (ANR), y búsqueda con lag.

Hallazgos concretos en el código (con archivo:línea al día de hoy):

| # | Problema | Dónde | Impacto |
|---|----------|-------|---------|
| 1 | La API **no comprime respuestas** (sin gzip). La descarga de sesión (7.398 fichas completas) viaja como JSON plano, varios MB | `apps/api/src/main.ts` | Alto — es la causa principal de la descarga de 2-3 min |
| 2 | `listarActivosLocal()` carga **toda la tabla a memoria JS** y filtra/ordena en JavaScript, **en cada tecleo** del buscador sin debounce | `apps/mobile/src/db/sync.ts:155-191`, `InicioScreen.tsx:119-122` | Alto — lag de búsqueda y ANR |
| 3 | `calcularResumenLocal()` llama a `listarActivosLocal()` (¡otro full scan + sort de 7.398 filas!) solo para **contar** | `apps/mobile/src/db/sync.ts:226-241` | Alto — se ejecuta en cada invalidación (cada guardado) |
| 4 | La lista usa `renderItem` inline sin memoizar, sin `getItemLayout` ni tuning de ventana, con 7.398 filas | `InicioScreen.tsx:140-154, 269-280` | Medio-alto — frames perdidos al hacer scroll |
| 5 | `descargarSesion()` inserta las 7.398 filas **una por una** (7.398 statements) aunque ya van en una transacción | `apps/mobile/src/db/sync.ts:80-119` | Medio — segundos extra en la descarga inicial |
| 6 | Las 3 llamadas de la descarga inicial (`getUbicaciones`, `getConfiguracionCampos`, `getSesionActivos`) son **secuenciales** | `apps/mobile/src/db/sync.ts:68-72` | Medio |
| 7 | Sentry con `tracesSampleRate: 1.0` — trazas de performance al 100% en producción | `apps/mobile/App.tsx` | Bajo-medio — overhead constante |
| 8 | `contarPendientesSync()` trae todas las filas y cuenta con `.length` en JS | `apps/mobile/src/db/sync.ts:249-252` | Bajo |
| 9 | Sin `PRAGMA journal_mode=WAL` en SQLite local — escrituras bloquean lecturas | `apps/mobile/src/db/client.ts` | Bajo-medio |
| 10 | Sin minificación R8/ProGuard en el build release | `apps/mobile/app.json` (falta `expo-build-properties`) | Bajo — APK más grande, arranque más lento |
| 11 | React Query sin `staleTime` ni `placeholderData` — la lista "parpadea" vacía en cada refetch | `App.tsx`, `InicioScreen.tsx` | Bajo-medio (percepción de lentitud) |
| 12 | La subida de fotos carga el archivo entero a memoria JS (`archivo.bytes()`) antes del `fetch` | `apps/mobile/src/lib/registro-offline.ts:69` | Bajo (riesgo de pico de memoria con 4 fotos en paralelo) |

---

## Paso 0 — Medir ANTES de tocar nada (medio día)

No se puede afirmar que algo mejoró sin una línea base. Toma estas 4 medidas con la APK
release actual instalada en el teléfono de pruebas (el mismo que usa el auditor):

1. **Descarga inicial**: borra datos de la app → inicia sesión → cronometra desde que
   aparece "Descargando la base de datos…" hasta que aparece la lista. Anota también el
   tamaño transferido (en el panel de Railway o con `adb shell dumpsys netstats`).
2. **Búsqueda**: con la sesión descargada, escribe 5 letras seguidas en el buscador y
   filma la pantalla en cámara lenta. Anota si se congela el teclado.
3. **Scroll**: activa el perf monitor (agita el teléfono → "Show Perf Monitor" en dev build)
   y haz scroll rápido por la lista. Anota los FPS de UI y JS.
4. **Guardar activo**: cronometra desde tocar "Guardar cambios" hasta ver la confirmación.

Guarda los 4 números en una nota. Repite la medición al final de cada fase.

---

## Fase 1 — Quick wins (1-2 días)

### Tarea 1.1 — Activar gzip en la API ⭐ (el mayor impacto de todo el plan)

**Objetivo:** que la descarga de sesión pase de varios MB a ~10-15% de su tamaño.

**Archivos:** `apps/api/src/main.ts`, `apps/api/package.json`

**Pasos:**
1. En `apps/api`: `pnpm add compression && pnpm add -D @types/compression`
2. En `main.ts`, después de crear la app y ANTES de los body parsers:

```ts
import compression from 'compression';
// ...dentro de bootstrap(), justo después de NestFactory.create:
app.use(compression());
```

3. `pnpm --filter api typecheck` y prueba local: `curl -H "Accept-Encoding: gzip" -sD - http://localhost:3000/api/v1/... | grep -i content-encoding` debe mostrar `gzip`.

**Verificar:** repetir la medida 1 del Paso 0. La transferencia debe bajar ~85% y el tiempo
de descarga proporcionalmente (la mayor parte del tiempo era red, no CPU).

**Riesgo:** ninguno relevante; `fetch` de React Native descomprime gzip automáticamente.

### Tarea 1.2 — Debounce del buscador + mantener resultados previos

**Objetivo:** que la búsqueda no dispare un query por cada tecla ni deje la lista en blanco
mientras carga.

**Archivo:** `apps/mobile/src/screens/InicioScreen.tsx`

**Pasos:**
1. Separa el texto del input (`q`) del término efectivo de búsqueda (`qDebounced`):

```tsx
const [q, setQ] = useState('');
const [qDebounced, setQDebounced] = useState('');

useEffect(() => {
  const t = setTimeout(() => setQDebounced(q), 300);
  return () => clearTimeout(t);
}, [q]);
```

2. Usa `qDebounced` en el query, y agrega `placeholderData` para que la lista anterior siga
   visible mientras llega la nueva (evita el "parpadeo a vacío"):

```tsx
const { data: activos, isLoading: activosLoading } = useQuery({
  queryKey: ['activos-local', qDebounced],
  queryFn: () => listarActivosLocal(qDebounced),
  placeholderData: (prev) => prev,
});
```

**Verificar:** escribir rápido en el buscador ya no congela el teclado; la lista se
actualiza ~300 ms después de dejar de escribir, sin quedar en blanco entre teclas.

### Tarea 1.3 — Filtrar y limitar en SQL, no en JavaScript

**Objetivo:** que `listarActivosLocal()` nunca materialice 7.398 objetos en JS. La pantalla
solo puede mostrar unas decenas de filas; traer más de ~200 no aporta nada.

**Archivo:** `apps/mobile/src/db/sync.ts` (función `listarActivosLocal`, líneas ~155-191)

**Pasos:**
1. Importa los helpers de drizzle: `like`, `sql`, `asc` (ya se importan `eq, isNull, and, or`).
2. Reemplaza el cuerpo por un query con `WHERE ... LIKE` y `LIMIT`:

```ts
const LIMITE_LISTA = 200;

export async function listarActivosLocal(q?: string): Promise<ActivoLocalConEstado[]> {
  const filtro = q?.trim().toLowerCase();
  const patron = filtro ? `%${filtro}%` : undefined;

  const activos = await db
    .select()
    .from(activosLocal)
    .where(
      patron
        ? or(
            sql`lower(${activosLocal.codigoAnterior}) LIKE ${patron}`,
            sql`lower(coalesce(${activosLocal.codigoNuevo}, '')) LIKE ${patron}`,
            sql`lower(${activosLocal.nombre}) LIKE ${patron}`,
            sql`lower(coalesce(${activosLocal.ubicacionSede}, '')) LIKE ${patron}`,
          )
        : undefined,
    )
    .orderBy(asc(activosLocal.codigoAnterior))
    .limit(LIMITE_LISTA);

  // La cola de pendientes es pequeña (decenas como mucho) — cargarla entera sigue bien.
  const pendientes = await db.select().from(colaRegistros).where(eq(colaRegistros.synced, 0));
  const pendientePorActivo = new Map<string, (typeof pendientes)[number]>();
  for (const p of pendientes) {
    if (!p.activoId) continue;
    const actual = pendientePorActivo.get(p.activoId);
    if (!actual || p.createdAt > actual.createdAt) pendientePorActivo.set(p.activoId, p);
  }

  return activos.map((a) => {
    const pendiente = pendientePorActivo.get(a.id);
    return {
      id: a.id,
      codigoAnterior: a.codigoAnterior,
      nombre: a.nombre,
      categoria: a.categoria,
      ubicacionSede: a.ubicacionSede,
      estado: (pendiente?.estado ?? a.estadoServidor) as EstadoAuditoria,
      ultimoAuditor: a.ultimoAuditorServidor,
      sinSincronizar: !!pendiente,
    };
  });
}
```

3. **Importante:** `calcularResumenLocal()` hoy depende de `listarActivosLocal()` para
   contar — se rompería con el LIMIT. Haz la Tarea 1.4 en el MISMO commit.

**Verificar:** `pnpm --filter mobile typecheck`; buscar cualquier texto devuelve resultados
correctos; la lista inicial muestra los primeros 200 por código.

**Riesgo:** si alguien dependía de ver "toda" la lista scrolleando, ahora ve máximo 200.
Para un inventario de 7.398 eso es correcto: la lista es para buscar, el trabajo real entra
por escaneo. Si el cliente lo pide, se agrega paginación con `offset` después.

### Tarea 1.4 — Resumen (KPIs) con COUNT en SQL

**Objetivo:** que los contadores del dashboard no carguen ni ordenen 7.398 filas.

**Archivo:** `apps/mobile/src/db/sync.ts` (función `calcularResumenLocal`)

**Pasos:** reemplaza la implementación por dos agregaciones:

```ts
export async function calcularResumenLocal(): Promise<ResumenLocal> {
  // Conteo base por estado del servidor (una sola pasada, en C, no en JS).
  const conteos = await db
    .select({ estado: activosLocal.estadoServidor, n: sql<number>`count(*)` })
    .from(activosLocal)
    .groupBy(activosLocal.estadoServidor);

  // Correcciones por mutaciones locales sin sincronizar: el estado "efectivo" de esos
  // activos es el de la cola, no el del servidor. Son pocas filas (lo pendiente de subir).
  const pendientes = await db
    .select()
    .from(colaRegistros)
    .where(eq(colaRegistros.synced, 0));

  const porEstado = new Map<string, number>();
  for (const c of conteos) porEstado.set(c.estado, c.n);

  const ultimaPorActivo = new Map<string, (typeof pendientes)[number]>();
  let noRegistrados = 0;
  for (const p of pendientes) {
    if (!p.activoId) {
      if (p.estado === 'NO_REGISTRADO') noRegistrados++;
      continue;
    }
    const actual = ultimaPorActivo.get(p.activoId);
    if (!actual || p.createdAt > actual.createdAt) ultimaPorActivo.set(p.activoId, p);
  }
  if (ultimaPorActivo.size > 0) {
    const ids = [...ultimaPorActivo.keys()];
    const filas = await db
      .select({ id: activosLocal.id, estadoServidor: activosLocal.estadoServidor })
      .from(activosLocal)
      .where(inArray(activosLocal.id, ids));
    for (const fila of filas) {
      const efectivo = ultimaPorActivo.get(fila.id)!.estado;
      if (efectivo !== fila.estadoServidor) {
        porEstado.set(fila.estadoServidor, (porEstado.get(fila.estadoServidor) ?? 1) - 1);
        porEstado.set(efectivo, (porEstado.get(efectivo) ?? 0) + 1);
      }
    }
  }

  const total = [...porEstado.values()].reduce((a, b) => a + b, 0);
  const pendientesN = porEstado.get('PENDIENTE') ?? 0;
  return {
    total,
    pendientes: pendientesN,
    auditados: porEstado.get('AUDITADO') ?? 0,
    diferencias: porEstado.get('DIFERENCIA') ?? 0,
    faltantes: porEstado.get('FALTANTE') ?? 0,
    noRegistrados,
    pct: total > 0 ? (total - pendientesN) / total : 0,
  };
}
```

(Agrega `inArray` al import de drizzle.)

**Verificar:** los 4 KPIs y el % de avance muestran los mismos números que antes del
cambio (compara con captura de pantalla previa). Guarda un activo offline y confirma que
el KPI se mueve igual que antes.

### Tarea 1.5 — `contarPendientesSync` con COUNT

**Archivo:** `apps/mobile/src/db/sync.ts`

```ts
export async function contarPendientesSync(): Promise<number> {
  const [fila] = await db
    .select({ n: sql<number>`count(*)` })
    .from(colaRegistros)
    .where(eq(colaRegistros.synced, 0));
  return fila?.n ?? 0;
}
```

### Tarea 1.6 — Bajar el sampling de Sentry

**Archivo:** `apps/mobile/App.tsx`

```ts
Sentry.init({
  dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
  environment: __DEV__ ? 'development' : 'production',
  tracesSampleRate: __DEV__ ? 1.0 : 0.15,
});
```

**Verificar:** typecheck; Sentry sigue recibiendo errores (las trazas de performance se
muestrean, los errores se reportan siempre).

---

## Fase 2 — Renderizado y capa de datos (2-3 días)

### Tarea 2.1 — Fila de lista memoizada + tuning del FlatList

**Objetivo:** scroll fluido con lista grande; que tocar un KPI o sincronizar no re-renderice
las ~15 filas visibles sin necesidad.

**Archivo:** `apps/mobile/src/screens/InicioScreen.tsx`

**Pasos:**
1. Extrae la fila a un componente memoizado FUERA de `InicioScreen` (arriba del archivo):

```tsx
const ALTO_FILA = 76; // padding 12×2 + 3 líneas de texto ≈ 68 + margen 8

const FilaActivo = memo(function FilaActivo({
  item,
  onPress,
}: {
  item: ActivoLocalConEstado;
  onPress: (id: string) => void;
}) {
  return (
    <Pressable style={styles.row} onPress={() => onPress(item.id)}>
      <CategoriaIcon categoria={item.categoria as CategoriaActivo} />
      <View style={{ flex: 1, marginLeft: spacing[3] }}>
        <Text style={styles.rowPlaca} numberOfLines={1}>{item.codigoAnterior}</Text>
        <Text style={styles.rowNombre} numberOfLines={1}>{item.nombre}</Text>
        <Text style={styles.rowUbicacion} numberOfLines={1}>{item.ubicacionSede ?? 'Sin ubicación'}</Text>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 4 }}>
        <EstadoBadge estado={item.estado} />
        {item.sinSincronizar && <Text style={styles.sinSyncLabel}>Sin sincronizar</Text>}
      </View>
      <ChevronRight size={18} color={colors.ink[400]} style={{ marginLeft: spacing[2] }} />
    </Pressable>
  );
});
```

   Los `numberOfLines={1}` son OBLIGATORIOS: fijan el alto de la fila, que es lo que hace
   válido el `getItemLayout` del paso 3.

2. Dentro del componente, estabiliza el callback y el render:

```tsx
const abrirDetalle = useCallback(
  (activoId: string) => navigation.navigate('Detalle', { activoId }),
  [navigation],
);
const renderItem = useCallback(
  ({ item }: { item: ActivoLocalConEstado }) => <FilaActivo item={item} onPress={abrirDetalle} />,
  [abrirDetalle],
);
```

3. Configura el FlatList:

```tsx
<FlatList
  style={{ flex: 1 }}
  data={activos ?? []}
  keyExtractor={(item) => item.id}
  renderItem={renderItem}
  getItemLayout={(_, index) => ({ length: ALTO_FILA, offset: ALTO_FILA * index, index })}
  initialNumToRender={12}
  maxToRenderPerBatch={12}
  windowSize={7}
  removeClippedSubviews
  keyboardShouldPersistTaps="handled"
  contentContainerStyle={{ paddingHorizontal: spacing[4], paddingBottom: 100 }}
  ListEmptyComponent={...}
/>
```

4. Ajusta `ALTO_FILA` al valor real: mide con el inspector de elementos (dev menu →
   "Toggle element inspector", toca una fila y lee el alto; suma el `marginBottom: 8`).

**Verificar:** perf monitor durante scroll rápido — JS FPS debe mantenerse > 50. Tocar
"Sincronizar ahora" no debe parpadear las filas visibles.

### Tarea 2.2 — Inserción por lotes en `descargarSesion`

**Objetivo:** reducir los 7.398 statements de inserción a ~15.

**Archivo:** `apps/mobile/src/db/sync.ts` (función `descargarSesion`)

**Pasos:**
1. Paraleliza las 3 descargas de red (hoy son secuenciales):

```ts
const [ubicaciones, configuracionCampos, fichasCompletas] = await Promise.all([
  getUbicaciones(),
  getConfiguracionCampos(),
  getSesionActivos(proyectoId),
]);
```

2. Dentro de la transacción, arma los valores y usa insert multi-fila en trozos de 500
   (límite de parámetros de SQLite: 32.766; 500 filas × 25 columnas = 12.500, holgado):

```ts
const filas = fichasCompletas.map((activo) => ({
  id: activo.id,
  codigoNuevo: activo.codigoNuevo ?? '',
  codigoAnterior: activo.codigoAnterior,
  // ... (exactamente el mismo mapeo de campos que existe hoy)
}));

db.transaction((tx) => {
  tx.delete(activosLocal).run();
  tx.delete(ubicacionesLocal).run();
  if (ubicaciones.length > 0) {
    tx.insert(ubicacionesLocal)
      .values(ubicaciones.map((u) => ({ id: u.id, codigo: u.codigo, sede: u.sede, detalle: u.detalle })))
      .run();
  }
  for (let i = 0; i < filas.length; i += 500) {
    tx.insert(activosLocal).values(filas.slice(i, i + 500)).run();
  }
});
```

**Verificar:** borra datos de la app y cronometra la descarga completa de nuevo (medida 1).
Confirma en la app que el total de activos coincide (KPI "total" = 7.398).

### Tarea 2.3 — PRAGMAs de SQLite (WAL)

**Archivo:** `apps/mobile/src/db/client.ts`

Al inicio de `inicializarBaseLocal()`, antes del DDL:

```ts
sqlite.execSync(`
  PRAGMA journal_mode = WAL;
  PRAGMA synchronous = NORMAL;
`);
```

WAL permite que las lecturas (lista, KPIs) no se bloqueen mientras la cola de sincronización
escribe. `synchronous = NORMAL` es seguro con WAL y reduce fsyncs.

**Verificar:** la app arranca normal; guardar un activo mientras la lista está abierta no
produce el error "database is locked".

### Tarea 2.4 — Defaults de React Query

**Objetivo:** evitar refetches innecesarios de queries locales que ya se invalidan
explícitamente con `invalidateQueries`.

**Archivo:** `apps/mobile/App.tsx`

```ts
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,        // los datos locales solo cambian cuando nosotros los invalidamos
      refetchOnWindowFocus: false,
    },
  },
});
```

**Verificar:** navegar Detalle → volver a Inicio no re-dispara todos los queries (se ve en
que la pantalla aparece instantánea); guardar un activo SÍ actualiza KPIs y lista (porque
esos flujos llaman `invalidateQueries`).

---

## Fase 3 — Build de producción (1 día)

### Tarea 3.1 — Minificación R8 + shrinkResources en el APK

**Archivos:** `apps/mobile/app.json`, `apps/mobile/package.json`

**Pasos:**
1. `pnpm --filter mobile add expo-build-properties`
2. En `app.json`, agrega el plugin:

```json
"plugins": [
  "expo-secure-store",
  "expo-sqlite",
  "@sentry/react-native",
  ["expo-build-properties", {
    "android": {
      "enableProguardInReleaseBuilds": true,
      "enableShrinkResourcesInReleaseBuilds": true
    }
  }]
]
```

3. Dispara el build de GitHub Actions (push a `main` con cambios en `apps/mobile/`) y
   descarga el APK.

**Verificar:** el APK debe pesar bastante menos (hoy ~48 MB). Instala y haz una pasada
completa de humo: login → descarga → escanear → guardar → sincronizar → logout. R8 puede
romper librerías que usan reflexión; si la app crashea al abrir, revisa el stacktrace en
`adb logcat` y agrega las reglas keep que indique la librería afectada (raro con este
stack: Expo ya trae reglas para sus módulos).

### Tarea 3.2 — Quitar `console.*` en producción

**Archivo:** crear `apps/mobile/babel.config.js` (hoy no existe, Expo usa su default):

```js
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    env: {
      production: {
        plugins: [['transform-remove-console', { exclude: ['error'] }]],
      },
    },
  };
};
```

Y `pnpm --filter mobile add -D babel-plugin-transform-remove-console`.

Impacto menor (solo hay 2 `console.warn` en `registro-offline.ts`, en el camino de
sincronización), pero deja el proyecto protegido contra logs futuros en hot paths.

---

## Fase 4 — Arquitectura (opcional, cuando las fases 1-3 ya estén medidas)

Estas tareas son de mayor esfuerzo. Solo abordarlas si después de las fases 1-3 las
mediciones siguen mostrando problemas, y de preferencia con supervisión de un dev senior.

### Tarea 4.1 — Sync incremental (delta) en vez de re-descarga completa

Hoy la descarga completa solo ocurre la primera vez, así que esto NO afecta el uso diario —
es para el caso "el coordinador re-importó el Excel a mitad de auditoría y el espejo local
quedó viejo".

Diseño sugerido:
- API: agregar `?actualizadoDesde=<ISO>` a `GET /activos/sesion`, filtrando por
  `updatedAt > actualizadoDesde` (el campo ya existe en el schema Prisma).
- Mobile: guardar en `meta_sesion` el timestamp de la última descarga; al abrir la app,
  pedir solo el delta y hacer upsert (`onConflictDoUpdate`) en `activos_local` en vez del
  delete-all + insert-all.
- Cuidado con los borrados: un activo eliminado en el servidor no aparece en el delta.
  Solución simple: incluir en la respuesta los ids con `deletedAt` reciente y borrarlos
  del espejo local.

### Tarea 4.2 — Sincronización de la cola con concurrencia limitada

`sincronizarPendientes()` procesa la cola en serie (`apps/mobile/src/lib/registro-offline.ts:146-156`).
Con 30 registros pendientes tras una mañana sin señal, eso es lento. Procesar en lotes de
3-4 con `Promise.all` sobre trozos del array acelera 3-4× sin saturar la API (rate limit
global: 100 req/min — no subir de 4 de concurrencia).

### Tarea 4.3 — Subir fotos directo desde disco (sin cargarlas a memoria JS)

En `subirYConfirmarFotos` (`registro-offline.ts:63-85`), `archivo.bytes()` materializa cada
JPEG (~300-500 KB) como `Uint8Array` en el heap JS antes del `fetch`, y con `Promise.all`
pueden ser 4 a la vez. Alternativa: `expo-file-system` `uploadAsync` (API legacy) o pasar
el `File` como body con `expo/fetch`, que transmiten desde disco. Baja prioridad — el
beneficio es estabilidad de memoria en teléfonos con poca RAM, no velocidad.

---

## Qué NO tocar (y por qué)

- **Hermes / Nueva Arquitectura**: Expo SDK 54 ya los trae activados por defecto. No
  agregar flags para "activarlos" — ya están.
- **La transacción única de `descargarSesion` y la subida paralela de fotos**: ya se
  optimizaron en julio 2026; no revertir.
- **`encolarRegistro` fire-and-forget**: el `void intentarSincronizar(...)` es intencional
  (guardado local instantáneo, red en segundo plano). No agregarle `await`.
- **Virtualización con FlashList**: con las tareas 1.3 + 2.1 (máximo 200 filas, filas
  memoizadas de alto fijo) el FlatList nativo sobra. Migrar a FlashList solo si las
  mediciones de scroll siguen mal después de la Fase 2.

## Checklist de cierre por fase

Al terminar cada fase:
1. `pnpm -r typecheck && pnpm -r lint` en verde.
2. Prueba de humo completa en un teléfono real (no emulador): login → descarga → buscar →
   escanear ubicación → escanear activo → actualizar con foto → modo avión → guardar otro →
   reconectar → verificar sincronización → logout.
3. Repetir las 4 mediciones del Paso 0 y anotar la comparación.
4. Un commit por tarea, mensaje en español describiendo el porqué (ver estilo del historial).
5. El APK de prueba sale del workflow de GitHub Actions (push a `main` → artefacto
   `adn-auditoria-release`).
