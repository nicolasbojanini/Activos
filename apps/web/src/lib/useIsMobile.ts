import { useEffect, useState } from 'react';

/** Debe coincidir con el breakpoint de .app-sidebar/.app-main en index.css. */
const BREAKPOINT_MOVIL = 768;

/**
 * true en viewports móviles — solo para las decisiones de layout que CSS no
 * puede resolver por sí solo (props de recharts como el ancho de un eje, o
 * qué markup renderizar). El resto del responsive design de esta app va por
 * CSS puro (auto-fit/minmax, @media en index.css), no por este hook.
 */
export function useIsMobile(): boolean {
  const [esMovil, setEsMovil] = useState(
    () => typeof window !== 'undefined' && window.innerWidth < BREAKPOINT_MOVIL,
  );

  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${BREAKPOINT_MOVIL - 1}px)`);
    const actualizar = () => setEsMovil(mql.matches);
    actualizar();
    mql.addEventListener('change', actualizar);
    return () => mql.removeEventListener('change', actualizar);
  }, []);

  return esMovil;
}
