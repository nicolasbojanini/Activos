-- CreateTable
CREATE TABLE "CampoUbicacion" (
    "id" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "etiqueta" TEXT NOT NULL,
    "requerido" BOOLEAN NOT NULL DEFAULT false,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CampoUbicacion_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "CampoUbicacion" ADD CONSTRAINT "CampoUbicacion_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
