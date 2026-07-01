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

/** Campos de Activo disponibles para el mapeo de columnas al importar (ver 02-MODELO-DE-DATOS.md). */
export const CAMPOS_ACTIVO_IMPORT: Array<{ campo: string; etiqueta: string; requerido: boolean }> = [
  { campo: 'placa', etiqueta: 'Placa', requerido: true },
  { campo: 'codigoQR', etiqueta: 'Código QR', requerido: false },
  { campo: 'nombre', etiqueta: 'Nombre / descripción', requerido: true },
  { campo: 'categoria', etiqueta: 'Categoría', requerido: false },
  { campo: 'marca', etiqueta: 'Marca', requerido: false },
  { campo: 'modelo', etiqueta: 'Modelo', requerido: false },
  { campo: 'serie', etiqueta: 'N° de serie', requerido: false },
  { campo: 'ubicacion', etiqueta: 'Ubicación (sede)', requerido: false },
  { campo: 'responsable', etiqueta: 'Responsable', requerido: false },
  { campo: 'centroCosto', etiqueta: 'Centro de costo', requerido: false },
  { campo: 'estadoFisico', etiqueta: 'Estado físico', requerido: false },
  { campo: 'fechaAdquisicion', etiqueta: 'Fecha de adquisición', requerido: false },
  { campo: 'valorLibros', etiqueta: 'Valor en libros', requerido: false },
  { campo: 'proveedor', etiqueta: 'Proveedor', requerido: false },
  { campo: 'vidaUtilMeses', etiqueta: 'Vida útil (meses)', requerido: false },
];
