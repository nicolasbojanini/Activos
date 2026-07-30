/** Letras (cualquier idioma, incluye tildes/ñ) y espacios — sin dígitos ni otra puntuación. */
const REGEX_SOLO_LETRAS = /^[\p{L}\s]*$/u;

/** Filtra en tiempo real cualquier carácter que no sea letra o espacio (p. ej. mientras el auditor escribe el nombre). */
export function soloLetras(texto: string): string {
  return texto.replace(/[^\p{L}\s]/gu, '');
}

/** Valida un texto ya existente (p. ej. el nombre de un activo importado antes de esta restricción). */
export function esSoloLetras(texto: string): boolean {
  return REGEX_SOLO_LETRAS.test(texto);
}
