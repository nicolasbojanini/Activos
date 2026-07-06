import type {
  CategoriaActivo,
  EstadoFisico,
  PrismaClient as TenantPrismaClient,
} from '../../generated/tenant-client';

const CATEGORIAS: CategoriaActivo[] = [
  'EQUIPOS_COMPUTO',
  'MOBILIARIO',
  'MAQUINARIA',
  'VEHICULOS',
  'HERRAMIENTAS',
  'OTRO',
];

const ESTADOS_FISICOS: EstadoFisico[] = ['BUENO', 'REGULAR', 'MALO', 'BAJA'];

const NOMBRES_ACTIVO: Record<CategoriaActivo, string[]> = {
  EQUIPOS_COMPUTO: [
    'Laptop Dell Latitude',
    'Monitor LG 24"',
    'Impresora HP LaserJet',
    'PC de escritorio',
  ],
  MOBILIARIO: [
    'Escritorio ejecutivo',
    'Silla ergonómica',
    'Archivador metálico',
    'Mesa de juntas',
  ],
  MAQUINARIA: [
    'Compresor de aire',
    'Montacargas eléctrico',
    'Soldadora industrial',
  ],
  VEHICULOS: ['Camioneta de reparto', 'Motocicleta de mensajería'],
  HERRAMIENTAS: ['Taladro industrial', 'Kit de llaves', 'Multímetro digital'],
  OTRO: ['Extintor', 'Aire acondicionado'],
};

/** Siembra ubicaciones + un proyecto + 20 activos demo en una base de datos tenant recién aprovisionada. */
export async function seedTenant(
  tenantPrisma: TenantPrismaClient,
): Promise<{ proyectoId: string }> {
  const sedeNorte = await tenantPrisma.ubicacion.create({
    data: { codigo: 'UBI-NORTE', sede: 'Sede Norte', detalle: 'Piso 1 · Bodega' },
  });
  const sedeSur = await tenantPrisma.ubicacion.create({
    data: { codigo: 'UBI-SUR', sede: 'Sede Sur', detalle: 'Piso 3 · Contabilidad' },
  });
  const ubicaciones = [sedeNorte, sedeSur];

  const proyecto = await tenantPrisma.proyectoAuditoria.create({
    data: {
      nombre: 'Inventario 2026 — Comercial Andina',
      fechaCorte: new Date('2026-06-30'),
    },
  });

  const totalActivos = 20;
  for (let i = 1; i <= totalActivos; i++) {
    const categoria = CATEGORIAS[i % CATEGORIAS.length];
    const nombresPorCategoria = NOMBRES_ACTIVO[categoria];
    const nombre = nombresPorCategoria[i % nombresPorCategoria.length];
    const codigoNuevo = `ADN-${String(4800 + i).padStart(6, '0')}`;

    await tenantPrisma.activo.create({
      data: {
        codigoNuevo,
        codigoAnterior: `OLD-${1000 + i}`,
        codigoControl: `CTRL-${i}`,
        nombre,
        descripcion: `${nombre} — unidad ${i}`,
        categoria,
        color: ['Negro', 'Gris', 'Blanco'][i % 3],
        medidas: '30x20x10 cm',
        capacidad: i % 4 === 0 ? '500W' : null,
        marca: 'Genérica',
        modelo: `M-${i}`,
        serie: `SN-${1000 + i}`,
        ubicacionId: ubicaciones[i % ubicaciones.length].id,
        responsable: 'Sin asignar',
        centroCosto: `CC-${100 + (i % 5)}`,
        estadoFisico: ESTADOS_FISICOS[i % ESTADOS_FISICOS.length],
        fechaAdquisicion: new Date(2022, i % 12, 1),
        valorLibros: 500000 + i * 37500,
        proveedor: 'Proveedor Demo S.A.S.',
        vidaUtilMeses: 60,
      },
    });
  }

  return { proyectoId: proyecto.id };
}
