-- CreateIndex
CREATE INDEX "RegistroAuditoria_proyectoId_activoId_auditadoEn_idx" ON "RegistroAuditoria"("proyectoId", "activoId", "auditadoEn" DESC);
