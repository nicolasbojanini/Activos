/**
 * Catálogo único de campos de Activo. Fuente de verdad para: sugerencias de
 * mapeo al importar, opciones de configuración por cliente (qué se muestra y
 * qué es obligatorio), y las etiquetas de la ficha en la web. `codigoAnterior`
 * es estructuralmente obligatorio (es el identificador único y estable del
 * activo) — la API rechaza intentos de ocultarlo o volverlo opcional.
 * `codigoNuevo` es la placa que se asigna/reemplaza durante la propia
 * auditoría, así que no puede ser la llave (cambia después de creado el activo).
 *
 * `permiteSugerencias`: si el coordinador puede activar sugerencias dinámicas
 * (autocompletar con lo que otros auditores ya escribieron en ese campo, en
 * ese proyecto) para este campo. Se excluyen los códigos/identificadores
 * (codigoAnterior/codigoNuevo/codigoControl — cada activo tiene el suyo, no
 * tiene sentido sugerir el de otro) y los campos que no son texto libre
 * (select/date/number) o que ya tienen su propio mecanismo de resolución
 * (ubicacion, vía el catálogo de Ubicacion).
 */
export const CAMPOS_ACTIVO_CATALOGO = [
  { campo: 'codigoAnterior', etiqueta: 'Código anterior', tipo: 'text', defaultVisible: true, defaultRequerido: true, permiteSugerencias: false },
  { campo: 'codigoNuevo', etiqueta: 'Código nuevo', tipo: 'text', defaultVisible: true, defaultRequerido: false, permiteSugerencias: false },
  { campo: 'codigoControl', etiqueta: 'Código de control', tipo: 'text', defaultVisible: true, defaultRequerido: false, permiteSugerencias: false },
  { campo: 'nombre', etiqueta: 'Nombre', tipo: 'text', defaultVisible: true, defaultRequerido: true, permiteSugerencias: true },
  { campo: 'descripcion', etiqueta: 'Descripción', tipo: 'text', defaultVisible: true, defaultRequerido: false, permiteSugerencias: true },
  { campo: 'ubicacion', etiqueta: 'Ubicación (sede)', tipo: 'text', defaultVisible: true, defaultRequerido: false, permiteSugerencias: false },
  { campo: 'color', etiqueta: 'Color', tipo: 'text', defaultVisible: true, defaultRequerido: false, permiteSugerencias: true },
  { campo: 'medidas', etiqueta: 'Medidas', tipo: 'text', defaultVisible: true, defaultRequerido: false, permiteSugerencias: true },
  { campo: 'capacidad', etiqueta: 'Capacidad', tipo: 'text', defaultVisible: true, defaultRequerido: false, permiteSugerencias: true },
  { campo: 'marca', etiqueta: 'Marca', tipo: 'text', defaultVisible: true, defaultRequerido: false, permiteSugerencias: true },
  { campo: 'modelo', etiqueta: 'Modelo', tipo: 'text', defaultVisible: true, defaultRequerido: false, permiteSugerencias: true },
  { campo: 'serie', etiqueta: 'Serial', tipo: 'text', defaultVisible: true, defaultRequerido: false, permiteSugerencias: true },
  { campo: 'estadoFisico', etiqueta: 'Estado', tipo: 'select', defaultVisible: true, defaultRequerido: true, permiteSugerencias: false },
  { campo: 'responsable', etiqueta: 'Responsable', tipo: 'text', defaultVisible: true, defaultRequerido: false, permiteSugerencias: true },
  { campo: 'centroCosto', etiqueta: 'CC Responsable', tipo: 'text', defaultVisible: true, defaultRequerido: false, permiteSugerencias: true },
  { campo: 'categoria', etiqueta: 'Categoría', tipo: 'select', defaultVisible: false, defaultRequerido: false, permiteSugerencias: false },
  { campo: 'fechaAdquisicion', etiqueta: 'Fecha de adquisición', tipo: 'date', defaultVisible: false, defaultRequerido: false, permiteSugerencias: false },
  { campo: 'valorLibros', etiqueta: 'Valor en libros', tipo: 'number', defaultVisible: false, defaultRequerido: false, permiteSugerencias: false },
  { campo: 'proveedor', etiqueta: 'Proveedor', tipo: 'text', defaultVisible: false, defaultRequerido: false, permiteSugerencias: true },
  { campo: 'vidaUtilMeses', etiqueta: 'Vida útil (meses)', tipo: 'number', defaultVisible: false, defaultRequerido: false, permiteSugerencias: false },
] as const;

export type CampoActivoKey = (typeof CAMPOS_ACTIVO_CATALOGO)[number]['campo'];

/** Campo estructuralmente obligatorio: es el `@@unique` del activo, no se puede ocultar ni volver opcional. */
export const CAMPO_IDENTIDAD: CampoActivoKey = 'codigoAnterior';

/**
 * Campos que ignoran cualquier configuración guardada del cliente y quedan
 * siempre visible+obligatorio: codigoAnterior (identificador único) y
 * ubicacion (la sección "Campos de ubicación" de ConfigurarCampos.tsx
 * promete que el campo base "siempre está" — si se pudiera ocultar desde
 * esta tabla de campos estándar, esa promesa quedaba rota sin que esa
 * sección se enterara, como pasó con Decameron). Tipado `string[]` (no
 * `CampoActivoKey[]`) por el mismo motivo que CAMPOS_CON_SUGERENCIAS_ELEGIBLES:
 * se compara contra el `campo: string` que ya viaja por la API/schemas.
 */
export const CAMPOS_BLOQUEADOS: string[] = [CAMPO_IDENTIDAD, 'ubicacion'];

/**
 * Claves del catálogo que admiten activar sugerencias dinámicas — ver
 * `permiteSugerencias` arriba. Tipado como `string[]` (no `CampoActivoKey[]`)
 * a propósito: se usa para comparar contra el `campo: string` que ya viaja
 * por la API/schemas, sin forzar casts en cada punto de uso.
 */
export const CAMPOS_CON_SUGERENCIAS_ELEGIBLES: string[] = CAMPOS_ACTIVO_CATALOGO.filter(
  (c) => c.permiteSugerencias,
).map((c) => c.campo);
