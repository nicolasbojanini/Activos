-- CreateEnum
CREATE TYPE "Rol" AS ENUM ('ADN_ADMIN', 'COORDINADOR', 'AUDITOR');

-- CreateEnum
CREATE TYPE "EstadoCliente" AS ENUM ('PROVISIONANDO', 'ACTIVO', 'SUSPENDIDO');

-- CreateTable
CREATE TABLE "Usuario" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "rol" "Rol" NOT NULL DEFAULT 'AUDITOR',
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cliente" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "nit" TEXT,
    "dbName" TEXT NOT NULL,
    "dbHost" TEXT NOT NULL DEFAULT 'localhost',
    "dbPort" INTEGER NOT NULL DEFAULT 5432,
    "estado" "EstadoCliente" NOT NULL DEFAULT 'PROVISIONANDO',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Cliente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AsignacionProyecto" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "proyectoId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AsignacionProyecto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_email_key" ON "Usuario"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Cliente_nit_key" ON "Cliente"("nit");

-- CreateIndex
CREATE UNIQUE INDEX "Cliente_dbName_key" ON "Cliente"("dbName");

-- CreateIndex
CREATE INDEX "AsignacionProyecto_usuarioId_clienteId_idx" ON "AsignacionProyecto"("usuarioId", "clienteId");

-- CreateIndex
CREATE UNIQUE INDEX "AsignacionProyecto_usuarioId_clienteId_proyectoId_key" ON "AsignacionProyecto"("usuarioId", "clienteId", "proyectoId");

-- AddForeignKey
ALTER TABLE "AsignacionProyecto" ADD CONSTRAINT "AsignacionProyecto_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AsignacionProyecto" ADD CONSTRAINT "AsignacionProyecto_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
