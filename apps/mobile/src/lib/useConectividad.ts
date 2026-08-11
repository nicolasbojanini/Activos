import { useEffect, useRef, useState } from 'react';
import NetInfo from '@react-native-community/netinfo';

/**
 * Conectividad actual + callback disparado en la transición offline → online
 * (para auto-sync). `previoRef` arranca en `false` (no en `true`) a
 * propósito: si arrancaba en `true`, un dispositivo que YA tenía señal al
 * abrir la app nunca disparaba el callback — la primera lectura de NetInfo
 * (conectado) no contaba como "transición" porque `previoRef` ya decía
 * "conectado" de entrada. En la práctica eso dejaba colas enteras de
 * registros sin sincronizar en dispositivos con señal buena, porque el
 * único disparador automático de sync nunca se activaba — había que tocar
 * "Sincronizar ahora" a mano. Arrancando en `false`, la primera lectura
 * conectada SÍ se trata como "recién conectado" y dispara el sync inicial.
 */
export function useConectividad(onReconectar?: () => void) {
  const [conectado, setConectado] = useState(true);
  const previoRef = useRef(false);
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
