/**
 * Catálogo único de campos de Activo. Fuente de verdad para: sugerencias de
 * mapeo al importar, opciones de configuración por cliente (qué se muestra y
 * qué es obligatorio), y las etiquetas de la ficha en la web. `codigoAnterior`
 * es estructuralmente obligatorio (es el identificador único y estable del
 * activo) — la API rechaza intentos de ocultarlo o volverlo opcional.
 * `codigoNuevo` es la placa que se asigna/reemplaza durante la propia
 * auditoría, así que no puede ser la llave (cambia después de creado el activo).
 */
export const CAMPOS_ACTIVO_CATALOGO = [
  { campo: 'codigoAnterior', etiqueta: 'Código anterior', tipo: 'text', defaultVisible: true, defaultRequerido: true },
  { campo: 'codigoNuevo', etiqueta: 'Código nuevo', tipo: 'text', defaultVisible: true, defaultRequerido: false },
  { campo: 'codigoControl', etiqueta: 'Código de control', tipo: 'text', defaultVisible: true, defaultRequerido: false },
  { campo: 'nombre', etiqueta: 'Nombre', tipo: 'text', defaultVisible: true, defaultRequerido: true },
  { campo: 'descripcion', etiqueta: 'Descripción', tipo: 'text', defaultVisible: true, defaultRequerido: false },
  { campo: 'ubicacion', etiqueta: 'Ubicación (sede)', tipo: 'text', defaultVisible: true, defaultRequerido: false },
  { campo: 'color', etiqueta: 'Color', tipo: 'text', defaultVisible: true, defaultRequerido: false },
  { campo: 'medidas', etiqueta: 'Medidas', tipo: 'text', defaultVisible: true, defaultRequerido: false },
  { campo: 'capacidad', etiqueta: 'Capacidad', tipo: 'text', defaultVisible: true, defaultRequerido: false },
  { campo: 'marca', etiqueta: 'Marca', tipo: 'text', defaultVisible: true, defaultRequerido: false },
  { campo: 'modelo', etiqueta: 'Modelo', tipo: 'text', defaultVisible: true, defaultRequerido: false },
  { campo: 'serie', etiqueta: 'Serial', tipo: 'text', defaultVisible: true, defaultRequerido: false },
  { campo: 'estadoFisico', etiqueta: 'Estado', tipo: 'select', defaultVisible: true, defaultRequerido: true },
  { campo: 'responsable', etiqueta: 'Responsable', tipo: 'text', defaultVisible: true, defaultRequerido: false },
  { campo: 'centroCosto', etiqueta: 'CC Responsable', tipo: 'text', defaultVisible: true, defaultRequerido: false },
  { campo: 'categoria', etiqueta: 'Categoría', tipo: 'select', defaultVisible: false, defaultRequerido: false },
  { campo: 'fechaAdquisicion', etiqueta: 'Fecha de adquisición', tipo: 'date', defaultVisible: false, defaultRequerido: false },
  { campo: 'valorLibros', etiqueta: 'Valor en libros', tipo: 'number', defaultVisible: false, defaultRequerido: false },
  { campo: 'proveedor', etiqueta: 'Proveedor', tipo: 'text', defaultVisible: false, defaultRequerido: false },
  { campo: 'vidaUtilMeses', etiqueta: 'Vida útil (meses)', tipo: 'number', defaultVisible: false, defaultRequerido: false },
] as const;

export type CampoActivoKey = (typeof CAMPOS_ACTIVO_CATALOGO)[number]['campo'];

/** Campo estructuralmente obligatorio: es el `@@unique` del activo, no se puede ocultar ni volver opcional. */
export const CAMPO_IDENTIDAD: CampoActivoKey = 'codigoAnterior';
