-- CreateTable
CREATE TABLE "ConfiguracionCampo" (
    "id" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "campo" TEXT NOT NULL,
    "visible" BOOLEAN NOT NULL DEFAULT true,
    "requerido" BOOLEAN NOT NULL DEFAULT false,
    "orden" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ConfiguracionCampo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampoPersonalizado" (
    "id" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "etiqueta" TEXT NOT NULL,
    "requerido" BOOLEAN NOT NULL DEFAULT false,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CampoPersonalizado_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ConfiguracionCampo_clienteId_campo_key" ON "ConfiguracionCampo"("clienteId", "campo");

-- AddForeignKey
ALTER TABLE "ConfiguracionCampo" ADD CONSTRAINT "ConfiguracionCampo_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampoPersonalizado" ADD CONSTRAINT "CampoPersonalizado_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
