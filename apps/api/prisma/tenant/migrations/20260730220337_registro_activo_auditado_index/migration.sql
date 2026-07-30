-- CreateIndex
CREATE INDEX "RegistroAuditoria_activoId_auditadoEn_idx" ON "RegistroAuditoria"("activoId", "auditadoEn" DESC);
