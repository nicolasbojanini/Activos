/**
 * Tipografía ADN: principal Gilroy Semibold (sustituto libre Poppins),
 * secundaria Arquitecta (sustituto Jost). Peso base 600 para títulos/UI.
 */
export const typography = {
  fontFamily: {
    display: "'Poppins', system-ui, sans-serif", // sustituto de Gilroy
    text: "'Jost', system-ui, sans-serif", // sustituto de Arquitecta
  },
  weight: {
    base: 600,
  },
  tracking: {
    title: '-0.02em', // rango -0.015 a -0.025em
    eyebrow: '0.14em', // rango 0.12 a 0.16em, MAYÚSCULA
  },
} as const;
