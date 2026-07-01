import { CategoriaActivo, EstadoFisico } from '@adn/shared';

/** Campos de Activo que se pueden mapear desde una columna del Excel/CSV importado. */
export const CAMPOS_ACTIVO = [
  'placa',
  'codigoQR',
  'nombre',
  'categoria',
  'marca',
  'modelo',
  'serie',
  'ubicacion',
  'responsable',
  'centroCosto',
  'estadoFisico',
  'fechaAdquisicion',
  'valorLibros',
  'proveedor',
  'vidaUtilMeses',
] as const;

export type CampoActivo = (typeof CAMPOS_ACTIVO)[number];

const SINONIMOS: Record<CampoActivo, string[]> = {
  placa: ['placa', 'codigo', 'código', 'codigo interno'],
  codigoQR: ['codigo qr', 'código qr', 'qr'],
  nombre: ['nombre', 'descripcion', 'descripción', 'activo'],
  categoria: ['categoria', 'categoría'],
  marca: ['marca'],
  modelo: ['modelo'],
  serie: [
    'serie',
    'numero de serie',
    'número de serie',
    'n° de serie',
    'n de serie',
  ],
  ubicacion: ['ubicacion', 'ubicación', 'sede'],
  responsable: ['responsable', 'custodio'],
  centroCosto: ['centro de costo', 'centro costo', 'cc'],
  estadoFisico: ['estado fisico', 'estado físico', 'estado'],
  fechaAdquisicion: [
    'fecha de adquisicion',
    'fecha de adquisición',
    'fecha adquisicion',
    'fecha compra',
  ],
  valorLibros: ['valor en libros', 'valor libros', 'valor'],
  proveedor: ['proveedor'],
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

/** Para cada campo de Activo, sugiere la columna del Excel que mejor coincide (o null si ninguna). */
export function sugerirMapeo(
  headers: string[],
): Record<CampoActivo, string | null> {
  const headersNormalizados = headers.map((h) => ({
    original: h,
    normalizado: normalizarTexto(h),
  }));
  const mapeo = {} as Record<CampoActivo, string | null>;

  for (const campo of CAMPOS_ACTIVO) {
    const sinonimosCampo = SINONIMOS[campo].map(normalizarTexto);
    const match = headersNormalizados.find((h) =>
      sinonimosCampo.includes(h.normalizado),
    );
    mapeo[campo] = match?.original ?? null;
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
