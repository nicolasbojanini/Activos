export const spacing = {
  0: 0,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  6: 24,
  8: 32,
  10: 40,
  16: 64,
} as const;

export const radius = {
  sm: 4,
  md: 8,
  lg: 14,
  xl: 20,
  pill: 999,
} as const;

export const motion = {
  durationMs: { min: 120, max: 320 },
  easing: 'ease-out',
} as const;

export const shadow = {
  color: 'rgba(11, 46, 79,',
  brand: '0 8px 24px rgba(0, 115, 207, 0.35)', // --shadow-brand: glow azul, solo CTA primario
} as const;
