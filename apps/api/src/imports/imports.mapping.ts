import {
  CAMPOS_ACTIVO_CATALOGO,
  type CampoActivoKey,
  type CategoriaActivo,
  type EstadoFisico,
} from '@adn/shared';

// Cada entrada es texto normalizado (ver normalizarTexto) que debe coincidir
// EXACTO con el encabezado completo de una columna — no es un "contains",
// así que agregar una palabra corta y genérica (p.ej. "codigo" a secas) es
// seguro porque solo dispara si esa es LA columna entera, no una que la
// contenga (como "código de control"). Incluye variantes en inglés porque en
// la práctica muchos clientes traen el inventario ya exportado de un sistema
// en inglés (NetSuite, Excel corporativo, etc.).
const SINONIMOS: Record<CampoActivoKey, string[]> = {
  codigoNuevo: [
    'codigo nuevo',
    'código nuevo',
    'codigo',
    'código',
    'placa',
    'codigo interno',
    'numero de placa',
    'número de placa',
    'asset id',
    'asset tag',
  ],
  codigoAnterior: ['codigo anterior', 'código anterior', 'previous code'],
  codigoControl: [
    'codigo de control',
    'código de control',
    'codigo control',
    'control code',
  ],
  nombre: [
    'nombre',
    'activo',
    'articulo',
    'artículo',
    'name',
    'nombre del activo',
  ],
  descripcion: ['descripcion', 'descripción', 'detalle', 'description'],
  ubicacion: ['ubicacion', 'ubicación', 'sede', 'location'],
  color: ['color'],
  medidas: ['medidas', 'dimensiones', 'dimensions'],
  capacidad: ['capacidad', 'capacity'],
  marca: ['marca', 'brand'],
  modelo: ['modelo', 'model'],
  serie: [
    'serie',
    'serial',
    'numero de serie',
    'número de serie',
    'n° de serie',
    'n de serie',
    'serial number',
  ],
  estadoFisico: ['estado fisico', 'estado físico', 'estado'],
  responsable: ['responsable', 'custodio', 'responsible', 'custodian'],
  centroCosto: [
    'centro de costo',
    'centro costo',
    'cc',
    'cc responsable',
    'cost center',
  ],
  categoria: ['categoria', 'categoría', 'category'],
  fechaAdquisicion: [
    'fecha de adquisicion',
    'fecha de adquisición',
    'fecha adquisicion',
    'fecha compra',
    'fecha de compra',
    'purchase date',
  ],
  valorLibros: [
    'valor en libros',
    'valor libros',
    'valor',
    'book value',
    'valor neto en libros',
    'sum of valor neto en libros',
  ],
  proveedor: ['proveedor', 'supplier', 'vendor'],
  vidaUtilMeses: [
    'vida util',
    'vida útil',
    'vida util (meses)',
    'vida útil (meses)',
  ],
};

export function normalizarTexto(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
}

const ETIQUETA_POR_CAMPO = new Map(
  CAMPOS_ACTIVO_CATALOGO.map((c) => [c.campo, c.etiqueta]),
);

/** Para cada campo dado (los visibles según la configuración del cliente), sugiere la columna del Excel que mejor coincide. */
export function sugerirMapeo(
  headers: string[],
  campos: CampoActivoKey[],
): Record<string, string | null> {
  const headersNormalizados = headers.map((h) => ({
    original: h,
    normalizado: normalizarTexto(h),
  }));
  const mapeo: Record<string, string | null> = {};

  for (const campo of campos) {
    // La propia etiqueta del catálogo ("Ubicación (sede)", "Código nuevo", etc.)
    // siempre cuenta como sinónimo válido — si el Excel ya trae el nombre
    // exacto que usa el sistema, no hace falta que esté también en la lista
    // curada a mano.
    const etiquetaCatalogo = ETIQUETA_POR_CAMPO.get(campo);
    const sinonimosCampo = [
      ...(etiquetaCatalogo ? [etiquetaCatalogo] : []),
      ...(SINONIMOS[campo] ?? []),
    ].map(normalizarTexto);
    const match = headersNormalizados.find((h) =>
      sinonimosCampo.includes(h.normalizado),
    );
    mapeo[campo] = match?.original ?? null;
  }

  return mapeo;
}

/** Prefijo de clave de mapeo/cambios para campos personalizados del cliente (mismo formato usado en registros.service.ts). */
export const PREFIJO_CAMPO_PERSONALIZADO = 'personalizado:';

/**
 * Igual que `sugerirMapeo`, pero para los campos personalizados del cliente:
 * no tienen sinónimos predefinidos (su etiqueta la eligió el cliente), así
 * que la única sugerencia razonable es una coincidencia exacta de texto
 * normalizado entre el encabezado y la etiqueta del campo.
 */
export function sugerirMapeoPersonalizados(
  headers: string[],
  personalizados: { id: string; etiqueta: string }[],
): Record<string, string | null> {
  const headersNormalizados = headers.map((h) => ({
    original: h,
    normalizado: normalizarTexto(h),
  }));
  const mapeo: Record<string, string | null> = {};

  for (const cp of personalizados) {
    const etiquetaNormalizada = normalizarTexto(cp.etiqueta);
    const match = headersNormalizados.find(
      (h) => h.normalizado === etiquetaNormalizada,
    );
    mapeo[`${PREFIJO_CAMPO_PERSONALIZADO}${cp.id}`] = match?.original ?? null;
  }

  return mapeo;
}

const CATEGORIAS_SINONIMOS: Array<[CategoriaActivo, string[]]> = [
  [
    'EQUIPOS_COMPUTO',
    ['equipos de computo', 'equipo de computo', 'computo', 'tecnologia'],
  ],
  ['MOBILIARIO', ['mobiliario', 'muebles']],
  ['MAQUINARIA', ['maquinaria', 'maquina']],
  ['VEHICULOS', ['vehiculos', 'vehiculo', 'transporte']],
  ['HERRAMIENTAS', ['herramientas', 'herramienta']],
];

export function normalizarCategoria(
  valor: string | undefined | null,
): CategoriaActivo {
  if (!valor) return 'OTRO';
  const normalizado = normalizarTexto(valor);
  for (const [categoria, sinonimos] of CATEGORIAS_SINONIMOS) {
    if (sinonimos.some((s) => normalizado.includes(s))) return categoria;
  }
  return 'OTRO';
}

const ESTADOS_SINONIMOS: Array<[EstadoFisico, string[]]> = [
  ['BUENO', ['bueno', 'buen estado']],
  ['REGULAR', ['regular']],
  ['MALO', ['malo', 'mal estado']],
  ['BAJA', ['baja', 'de baja']],
];

export function normalizarEstadoFisico(
  valor: string | undefined | null,
): EstadoFisico {
  if (!valor) return 'BUENO';
  const normalizado = normalizarTexto(valor);
  for (const [estado, sinonimos] of ESTADOS_SINONIMOS) {
    if (sinonimos.some((s) => normalizado.includes(s))) return estado;
  }
  return 'BUENO';
}

export { CAMPOS_ACTIVO_CATALOGO };
