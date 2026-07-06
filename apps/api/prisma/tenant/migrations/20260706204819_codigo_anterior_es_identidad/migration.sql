-- DropIndex
DROP INDEX "Activo_codigoNuevo_key";

-- AlterTable
ALTER TABLE "Activo" ALTER COLUMN "codigoAnterior" SET NOT NULL,
ALTER COLUMN "codigoNuevo" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Activo_codigoAnterior_key" ON "Activo"("codigoAnterior");
