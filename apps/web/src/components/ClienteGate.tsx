import { useEffect } from 'react';
import { Outlet } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { getClientes, getMiAsignacion } from '../lib/services';
import { useClienteStore } from '../lib/cliente-store';
import { useAuthStore } from '../lib/auth-store';
import { Layout } from './Layout';

/**
 * Asegura que haya un cliente activo seleccionado antes de renderizar las
 * páginas protegidas (todas cuelgan de /clientes/:clienteId en el backend).
 *
 * El rol CLIENTE es un caso aparte: GET /clientes (lista todas las empresas
 * de ADN) es ADN_ADMIN/COORDINADOR — un usuario Cliente no puede ni debe
 * pedirlo, así que en vez de eso resuelve su única asignación directo desde
 * /usuarios/me/asignacion (el mismo endpoint que ya usa la app móvil), sin
 * poblar la lista de clientes — así el selector de cliente del sidebar
 * (Layout.tsx) no tiene nada que mostrar y queda oculto.
 *
 * Para ADN_ADMIN/COORDINADOR/AUDITOR: si el cliente guardado ya no existe en
 * la lista (o no hay ninguno), elige el primero disponible automáticamente.
 */
export function ClienteGate() {
  const usuario = useAuthStore((s) => s.usuario);
  const clienteId = useClienteStore((s) => s.clienteId);
  const clientes = useClienteStore((s) => s.clientes);
  const setClienteId = useClienteStore((s) => s.setClienteId);
  const setClientes = useClienteStore((s) => s.setClientes);

  const esCliente = usuario?.rol === 'CLIENTE';

  const { data: miAsignacion, isLoading: asignacionLoading } = useQuery({
    queryKey: ['mi-asignacion'],
    queryFn: getMiAsignacion,
    enabled: esCliente,
  });

  const { data: todosLosClientes, isLoading: clientesLoading } = useQuery({
    queryKey: ['clientes'],
    queryFn: getClientes,
    enabled: !esCliente,
  });

  useEffect(() => {
    if (esCliente) {
      if (miAsignacion) setClienteId(miAsignacion.clienteId);
      return;
    }
    if (!todosLosClientes) return;
    setClientes(todosLosClientes);
    const sigueExistiendo = todosLosClientes.some((c) => c.id === clienteId);
    if (!sigueExistiendo && todosLosClientes[0]) {
      setClienteId(todosLosClientes[0].id);
    }
  }, [esCliente, miAsignacion, todosLosClientes, clienteId, setClientes, setClienteId]);

  if (esCliente) {
    if (asignacionLoading) {
      return <p style={{ padding: 32 }}>Cargando…</p>;
    }
    if (!miAsignacion) {
      return (
        <Layout>
          <p style={{ color: 'var(--adn-ink-500)' }}>
            Todavía no tienes ningún proyecto asignado. Contacta a tu coordinador de ADN.
          </p>
        </Layout>
      );
    }
    return <Outlet />;
  }

  if (clientesLoading) {
    return <p style={{ padding: 32 }}>Cargando…</p>;
  }

  if (!clienteId || clientes.length === 0) {
    // Sin Layout acá, un ADN_ADMIN recién creado en una base nueva quedaba
    // varado: sin sidebar no hay forma de llegar a /clientes para crear el
    // primero — la única salida era que otro admin lo resolviera por SQL.
    return (
      <Layout>
        <p style={{ color: 'var(--adn-ink-500)' }}>
          {usuario?.rol === 'ADN_ADMIN'
            ? 'Todavía no hay ningún cliente. Ve a "Clientes" para crear el primero.'
            : 'No tienes ningún cliente disponible. Contacta a un administrador de ADN.'}
        </p>
      </Layout>
    );
  }

  return <Outlet />;
}
