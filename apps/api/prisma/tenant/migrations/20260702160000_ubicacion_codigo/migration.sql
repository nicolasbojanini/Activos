-- AlterTable: add nullable first, backfill, then enforce NOT NULL + UNIQUE
ALTER TABLE "Ubicacion" ADD COLUMN "codigo" TEXT;

UPDATE "Ubicacion"
SET "codigo" = 'UBI-' || UPPER(RIGHT(id, 8))
WHERE "codigo" IS NULL;

ALTER TABLE "Ubicacion" ALTER COLUMN "codigo" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Ubicacion_codigo_key" ON "Ubicacion"("codigo");
