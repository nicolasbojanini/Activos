import { useEffect, useRef, useState } from 'react';
import NetInfo from '@react-native-community/netinfo';

/** Conectividad actual + callback disparado solo en la transición offline → online (para auto-sync). */
export function useConectividad(onReconectar?: () => void) {
  const [conectado, setConectado] = useState(true);
  const previoRef = useRef(true);
  const callbackRef = useRef(onReconectar);

  useEffect(() => {
    callbackRef.current = onReconectar;
  }, [onReconectar]);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((estado) => {
      const ahoraConectado = !!estado.isConnected;
      setConectado(ahoraConectado);
      if (ahoraConectado && !previoRef.current) {
        callbackRef.current?.();
      }
      previoRef.current = ahoraConectado;
    });
    return unsubscribe;
  }, []);

  return conectado;
}
