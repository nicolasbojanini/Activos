-- DropIndex
DROP INDEX "Activo_codigoQR_idx";

-- DropIndex
DROP INDEX "Activo_placa_key";

-- AlterTable
ALTER TABLE "Activo" DROP COLUMN "codigoQR",
DROP COLUMN "placa",
ADD COLUMN     "camposPersonalizados" JSONB,
ADD COLUMN     "capacidad" TEXT,
ADD COLUMN     "codigoAnterior" TEXT,
ADD COLUMN     "codigoControl" TEXT,
ADD COLUMN     "codigoNuevo" TEXT NOT NULL,
ADD COLUMN     "color" TEXT,
ADD COLUMN     "descripcion" TEXT,
ADD COLUMN     "medidas" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Activo_codigoNuevo_key" ON "Activo"("codigoNuevo");
