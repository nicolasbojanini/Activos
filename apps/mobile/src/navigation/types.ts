export type RootStackParamList = {
  Login: undefined;
  Inicio: undefined;
  Escaneo: { modo?: 'activo' | 'ubicacion' } | undefined;
  Detalle: { activoId: string; escaneado?: boolean };
  Actualizar: { activoId: string };
  NoRegistrado: { codigo: string };
  UbicacionNoRegistrada: { codigo: string };
  Confirmacion: {
    resultado: 'AUDITADO' | 'DIFERENCIA' | 'FALTANTE' | 'NO_REGISTRADO';
    titulo: string;
    mensaje: string;
    nombreActivo?: string;
    codigo?: string;
  };
};
