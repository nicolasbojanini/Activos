-- CreateEnum
CREATE TYPE "EstadoAuditoria" AS ENUM ('PENDIENTE', 'AUDITADO', 'DIFERENCIA', 'FALTANTE', 'NO_REGISTRADO');

-- CreateEnum
CREATE TYPE "EstadoFisico" AS ENUM ('BUENO', 'REGULAR', 'MALO', 'BAJA');

-- CreateEnum
CREATE TYPE "CategoriaActivo" AS ENUM ('EQUIPOS_COMPUTO', 'MOBILIARIO', 'MAQUINARIA', 'VEHICULOS', 'HERRAMIENTAS', 'OTRO');

-- CreateTable
CREATE TABLE "Ubicacion" (
    "id" TEXT NOT NULL,
    "sede" TEXT NOT NULL,
    "detalle" TEXT,

    CONSTRAINT "Ubicacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProyectoAuditoria" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "fechaCorte" TIMESTAMP(3) NOT NULL,
    "cerrado" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProyectoAuditoria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Activo" (
    "id" TEXT NOT NULL,
    "placa" TEXT NOT NULL,
    "codigoQR" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "categoria" "CategoriaActivo" NOT NULL,
    "marca" TEXT,
    "modelo" TEXT,
    "serie" TEXT,
    "ubicacionId" TEXT,
    "responsable" TEXT,
    "centroCosto" TEXT,
    "estadoFisico" "EstadoFisico" NOT NULL DEFAULT 'BUENO',
    "fechaAdquisicion" TIMESTAMP(3),
    "valorLibros" DECIMAL(14,2),
    "proveedor" TEXT,
    "vidaUtilMeses" INTEGER,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Activo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RegistroAuditoria" (
    "id" TEXT NOT NULL,
    "proyectoId" TEXT NOT NULL,
    "activoId" TEXT,
    "auditorId" TEXT NOT NULL,
    "estado" "EstadoAuditoria" NOT NULL,
    "estadoFisico" "EstadoFisico",
    "cambios" JSONB,
    "nota" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "auditadoEn" TIMESTAMP(3) NOT NULL,
    "clientId" TEXT NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RegistroAuditoria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Foto" (
    "id" TEXT NOT NULL,
    "registroId" TEXT NOT NULL,
    "s3Key" TEXT NOT NULL,
    "etiqueta" TEXT,
    "ancho" INTEGER,
    "alto" INTEGER,
    "bytes" INTEGER,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Foto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoteImportacion" (
    "id" TEXT NOT NULL,
    "proyectoId" TEXT NOT NULL,
    "archivoNombre" TEXT NOT NULL,
    "s3Key" TEXT,
    "filasTotales" INTEGER NOT NULL,
    "filasCreadas" INTEGER NOT NULL,
    "filasActualizadas" INTEGER NOT NULL,
    "filasError" INTEGER NOT NULL,
    "erroresJson" JSONB,
    "autorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoteImportacion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Activo_codigoQR_idx" ON "Activo"("codigoQR");

-- CreateIndex
CREATE UNIQUE INDEX "Activo_placa_key" ON "Activo"("placa");

-- CreateIndex
CREATE UNIQUE INDEX "RegistroAuditoria_clientId_key" ON "RegistroAuditoria"("clientId");

-- CreateIndex
CREATE INDEX "RegistroAuditoria_proyectoId_estado_idx" ON "RegistroAuditoria"("proyectoId", "estado");

-- AddForeignKey
ALTER TABLE "Activo" ADD CONSTRAINT "Activo_ubicacionId_fkey" FOREIGN KEY ("ubicacionId") REFERENCES "Ubicacion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegistroAuditoria" ADD CONSTRAINT "RegistroAuditoria_proyectoId_fkey" FOREIGN KEY ("proyectoId") REFERENCES "ProyectoAuditoria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegistroAuditoria" ADD CONSTRAINT "RegistroAuditoria_activoId_fkey" FOREIGN KEY ("activoId") REFERENCES "Activo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Foto" ADD CONSTRAINT "Foto_registroId_fkey" FOREIGN KEY ("registroId") REFERENCES "RegistroAuditoria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoteImportacion" ADD CONSTRAINT "LoteImportacion_proyectoId_fkey" FOREIGN KEY ("proyectoId") REFERENCES "ProyectoAuditoria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
