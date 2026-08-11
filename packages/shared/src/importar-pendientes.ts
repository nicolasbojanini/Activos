/**
 * Fallback offline: cuando un dispositivo no tiene señal en absoluto (ni
 * siquiera intermitente), la cola local de auditorías sin sincronizar se
 * puede exportar a un .xlsx (ver `exportarPendientes` en mobile) para
 * transportarla manualmente a una PC con red y subirla desde el portal web
 * (ver `importarPendientes` en la API). Los nombres de columna son la
 * frontera entre ambos lados — deben coincidir exacto en los dos.
 *
 * Las fotos NO viajan en el Excel (son binarios, no texto/JSON razonable
 * para una fila): solo su metadata (clientPhotoId/etiqueta/orden), para que
 * la fila de RegistroAuditoria quede creada en el servidor con esos slots de
 * foto pendientes. El archivo en sí se sube después, normal, cuando el
 * dispositivo recupere señal — `RegistrosService.crear()` es idempotente por
 * `clientId`, así que ese reintento no duplica el registro, solo completa lo
 * que falta.
 */
export const COLUMNAS_EXPORT_PENDIENTES = {
  clientId: 'ClientId',
  clienteId: 'ClienteId',
  proyectoId: 'ProyectoId',
  activoId: 'ActivoId',
  codigo: 'Código',
  nombre: 'Nombre',
  estado: 'Estado',
  estadoFisico: 'EstadoFisico',
  cambiosJson: 'CambiosJson',
  nota: 'Nota',
  lat: 'Lat',
  lng: 'Lng',
  auditadoEn: 'AuditadoEn',
  fotosJson: 'FotosJson',
  auditorId: 'AuditorId',
} as const;

export interface ImportarPendientesFilaError {
  fila: number;
  codigo: string | null;
  mensaje: string;
}

export interface ImportarPendientesResultadoOutput {
  total: number;
  importados: number;
  errores: ImportarPendientesFilaError[];
}
