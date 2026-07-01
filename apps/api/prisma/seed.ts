import { PrismaClient, CategoriaActivo, EstadoFisico } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

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
  EQUIPOS_COMPUTO: ['Laptop Dell Latitude', 'Monitor LG 24"', 'Impresora HP LaserJet', 'PC de escritorio'],
  MOBILIARIO: ['Escritorio ejecutivo', 'Silla ergonómica', 'Archivador metálico', 'Mesa de juntas'],
  MAQUINARIA: ['Compresor de aire', 'Montacargas eléctrico', 'Soldadora industrial'],
  VEHICULOS: ['Camioneta de reparto', 'Motocicleta de mensajería'],
  HERRAMIENTAS: ['Taladro industrial', 'Kit de llaves', 'Multímetro digital'],
  OTRO: ['Extintor', 'Aire acondicionado'],
};

async function main() {
  const organizacion = await prisma.organizacion.upsert({
    where: { nit: '900123456-1' },
    update: {},
    create: {
      nombre: 'Comercial Andina S.A.S.',
      nit: '900123456-1',
    },
  });

  const passwordHash = await argon2.hash('adn12345');

  const coordinador = await prisma.usuario.upsert({
    where: { email: 'coordinador@adn.demo' },
    update: {},
    create: {
      organizacionId: organizacion.id,
      nombre: 'Camila Restrepo',
      email: 'coordinador@adn.demo',
      passwordHash,
      rol: 'COORDINADOR',
    },
  });

  const auditor = await prisma.usuario.upsert({
    where: { email: 'auditor@adn.demo' },
    update: {},
    create: {
      organizacionId: organizacion.id,
      nombre: 'Julián Restrepo',
      email: 'auditor@adn.demo',
      passwordHash,
      rol: 'AUDITOR',
    },
  });
  void auditor;

  const sedeNorte = await prisma.ubicacion.create({
    data: { organizacionId: organizacion.id, sede: 'Sede Norte', detalle: 'Piso 1 · Bodega' },
  });
  const sedeSur = await prisma.ubicacion.create({
    data: { organizacionId: organizacion.id, sede: 'Sede Sur', detalle: 'Piso 3 · Contabilidad' },
  });
  const ubicaciones = [sedeNorte, sedeSur];

  const proyecto = await prisma.proyectoAuditoria.create({
    data: {
      organizacionId: organizacion.id,
      nombre: 'Inventario 2026 — Comercial Andina',
      fechaCorte: new Date('2026-06-30'),
    },
  });

  const totalActivos = 20;
  for (let i = 1; i <= totalActivos; i++) {
    const categoria = CATEGORIAS[i % CATEGORIAS.length];
    const nombresPorCategoria = NOMBRES_ACTIVO[categoria];
    const nombre = nombresPorCategoria[i % nombresPorCategoria.length];
    const placa = `ADN-${String(4800 + i).padStart(6, '0')}`;

    await prisma.activo.create({
      data: {
        organizacionId: organizacion.id,
        placa,
        codigoQR: placa,
        nombre,
        categoria,
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

  console.log('Seed completo:', {
    organizacion: organizacion.nombre,
    usuarios: [coordinador.email, auditor.email],
    proyecto: proyecto.nombre,
    activos: totalActivos,
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
