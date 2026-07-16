export type RootStackParamList = {
  Login: undefined;
  Inicio: undefined;
  Escaneo: undefined;
  Detalle: { activoId: string; escaneado?: boolean };
  Actualizar: { activoId: string };
  NoRegistrado: { codigo: string };
  Ubicacion: undefined;
  Confirmacion: {
    resultado: 'AUDITADO' | 'DIFERENCIA' | 'FALTANTE' | 'NO_REGISTRADO';
    titulo: string;
    mensaje: string;
    nombreActivo?: string;
    codigo?: string;
  };
};
