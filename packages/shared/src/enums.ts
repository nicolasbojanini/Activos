export const Rol = {
  COORDINADOR: 'COORDINADOR',
  AUDITOR: 'AUDITOR',
} as const;
export type Rol = (typeof Rol)[keyof typeof Rol];

export const EstadoAuditoria = {
  PENDIENTE: 'PENDIENTE',
  AUDITADO: 'AUDITADO',
  DIFERENCIA: 'DIFERENCIA',
  FALTANTE: 'FALTANTE',
  NO_REGISTRADO: 'NO_REGISTRADO',
} as const;
export type EstadoAuditoria = (typeof EstadoAuditoria)[keyof typeof EstadoAuditoria];

export const EstadoFisico = {
  BUENO: 'BUENO',
  REGULAR: 'REGULAR',
  MALO: 'MALO',
  BAJA: 'BAJA',
} as const;
export type EstadoFisico = (typeof EstadoFisico)[keyof typeof EstadoFisico];

export const CategoriaActivo = {
  EQUIPOS_COMPUTO: 'EQUIPOS_COMPUTO',
  MOBILIARIO: 'MOBILIARIO',
  MAQUINARIA: 'MAQUINARIA',
  VEHICULOS: 'VEHICULOS',
  HERRAMIENTAS: 'HERRAMIENTAS',
  OTRO: 'OTRO',
} as const;
export type CategoriaActivo = (typeof CategoriaActivo)[keyof typeof CategoriaActivo];
