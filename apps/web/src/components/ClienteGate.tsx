import { useEffect } from 'react';
import { Outlet } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { getClientes } from '../lib/services';
import { useClienteStore } from '../lib/cliente-store';
import { useAuthStore } from '../lib/auth-store';
import { Layout } from './Layout';

/**
 * Asegura que haya un cliente activo seleccionado antes de renderizar las
 * páginas protegidas (todas cuelgan de /clientes/:clienteId en el backend).
 * Si el cliente guardado ya no existe en la lista (o no hay ninguno), elige
 * el primero disponible automáticamente.
 */
export function ClienteGate() {
  const usuario = useAuthStore((s) => s.usuario);
  const clienteId = useClienteStore((s) => s.clienteId);
  const clientes = useClienteStore((s) => s.clientes);
  const setClienteId = useClienteStore((s) => s.setClienteId);
  const setClientes = useClienteStore((s) => s.setClientes);

  const { data, isLoading } = useQuery({ queryKey: ['clientes'], queryFn: getClientes });

  useEffect(() => {
    if (!data) return;
    setClientes(data);
    const sigueExistiendo = data.some((c) => c.id === clienteId);
    if (!sigueExistiendo && data[0]) {
      setClienteId(data[0].id);
    }
  }, [data, clienteId, setClientes, setClienteId]);

  if (isLoading) {
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
