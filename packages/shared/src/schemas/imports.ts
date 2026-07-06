import { z } from 'zod';

export const importCommitSchema = z.object({
  proyectoId: z.string(),
  archivoNombre: z.string(),
  mapeo: z.record(z.string(), z.string().nullable()),
  filas: z.array(z.record(z.string(), z.unknown())),
});

export type ImportCommitInput = z.infer<typeof importCommitSchema>;

export interface ImportPreviewOutput {
  columnasDetectadas: string[];
  muestra: Record<string, unknown>[];
  mapeoSugerido: Record<string, string | null>;
}

export interface ImportErrorRow {
  fila: number;
  campo: string;
  motivo: string;
}

export interface ImportCommitOutput {
  id: string;
  filasTotales: number;
  filasCreadas: number;
  filasActualizadas: number;
  filasError: number;
  erroresJson: ImportErrorRow[];
}
