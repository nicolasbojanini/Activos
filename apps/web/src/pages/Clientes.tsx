import { useState, type FormEvent } from 'react';
import { Link, Navigate } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, Settings2, Trash2 } from 'lucide-react';
import { Layout } from '../components/Layout';
import { useAuthStore } from '../lib/auth-store';
import { ApiError } from '../lib/api';
import { actualizarEstadoCliente, crearCliente, eliminarCliente, getClientes } from '../lib/services';

const ESTADO_LABEL: Record<string, { label: string; color: string }> = {
  ACTIVO: { label: 'Activo', color: 'var(--adn-success)' },
  PROVISIONANDO: { label: 'Aprovisionando…', color: 'var(--adn-warning)' },
  SUSPENDIDO: { label: 'Suspendido', color: 'var(--adn-danger)' },
};

export function Clientes() {
  const usuario = useAuthStore((s) => s.usuario);
  const queryClient = useQueryClient();
  const [nombre, setNombre] = useState('');
  const [nit, setNit] = useState('');

  const { data: clientes, isLoading } = useQuery({ queryKey: ['clientes'], queryFn: getClientes });

  const crearMutation = useMutation({
    mutationFn: () => crearCliente({ nombre, nit: nit || undefined }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['clientes'] });
      setNombre('');
      setNit('');
    },
  });

  const estadoMutation = useMutation({
    mutationFn: ({ id, estado }: { id: string; estado: 'ACTIVO' | 'SUSPENDIDO' }) =>
      actualizarEstadoCliente(id, { estado }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['clientes'] }),
  });

  const eliminarMutation = useMutation({
    mutationFn: (id: string) => eliminarCliente(id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['clientes'] }),
  });

  const handleEliminar = (id: string, nombreCliente: string) => {
    const confirmado = window.confirm(
      `¿Eliminar "${nombreCliente}" permanentemente? Esto borra su base de datos completa y no se puede deshacer. Asegúrate de haber descargado los reportes y fotos antes de continuar.`,
    );
    if (confirmado) eliminarMutation.mutate(id);
  };

  if (usuario && usuario.rol !== 'ADN_ADMIN' && usuario.rol !== 'COORDINADOR') {
    return <Navigate to="/auditorias" replace />;
  }

  return (
    <Layout>
      <header style={{ marginBottom: 24 }}>
        <p className="eyebrow">CL/ CLIENTES</p>
        <h1 style={{ fontSize: 24 }}>Clientes</h1>
        <p style={{ color: 'var(--adn-ink-500)', fontSize: 13, margin: '4px 0 0' }}>
          Cada cliente nuevo se aprovisiona con su propia base de datos física, aislada de las demás. Cuando un
          proyecto termina: suspende el cliente (bloquea el acceso, conserva la base de datos) y, ya con los
          reportes descargados, elimínalo para no dejar bases de datos sin usar.
        </p>
      </header>

      <form
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          crearMutation.mutate();
        }}
        style={{
          background: '#fff',
          border: '1px solid var(--adn-ink-200)',
          borderRadius: 'var(--adn-radius-lg)',
          padding: 20,
          marginBottom: 20,
          display: 'grid',
          gridTemplateColumns: '1fr 220px auto',
          gap: 12,
          alignItems: 'end',
        }}
      >
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, fontWeight: 600 }}>
          Nombre del cliente
          <input required value={nombre} onChange={(e) => setNombre(e.target.value)} style={inputStyle} />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, fontWeight: 600 }}>
          NIT (opcional)
          <input value={nit} onChange={(e) => setNit(e.target.value)} style={inputStyle} />
        </label>
        <button type="submit" disabled={crearMutation.isPending} style={primaryButtonStyle}>
          {crearMutation.isPending ? 'Creando base de datos…' : 'Dar de alta cliente'}
        </button>
        {crearMutation.isError && (
          <p style={{ gridColumn: '1 / -1', fontSize: 12, color: 'var(--adn-danger)', margin: 0 }}>
            {crearMutation.error instanceof ApiError ? crearMutation.error.message : 'No se pudo crear el cliente'}
          </p>
        )}
      </form>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
        {clientes?.map((cliente) => {
          const estado = ESTADO_LABEL[cliente.estado] ?? { label: cliente.estado, color: 'var(--adn-ink-500)' };
          const enTransicion =
            (estadoMutation.isPending && estadoMutation.variables?.id === cliente.id) ||
            (eliminarMutation.isPending && eliminarMutation.variables === cliente.id);
          return (
            <div
              key={cliente.id}
              style={{
                background: '#fff',
                border: '1px solid var(--adn-ink-200)',
                borderRadius: 'var(--adn-radius-lg)',
                padding: 20,
                opacity: enTransicion ? 0.6 : 1,
              }}
            >
              <Building2 size={20} strokeWidth={1.8} color="var(--adn-blue)" style={{ marginBottom: 8 }} />
              <h3 style={{ fontSize: 15, marginBottom: 4 }}>{cliente.nombre}</h3>
              {cliente.nit && <p style={{ fontSize: 12, color: 'var(--adn-ink-500)', margin: '0 0 8px' }}>{cliente.nit}</p>}
              <span style={{ fontSize: 12, fontWeight: 600, color: estado.color }}>{estado.label}</span>

              {cliente.estado !== 'PROVISIONANDO' && (
                <div style={{ display: 'flex', gap: 12, marginTop: 12, borderTop: '1px solid var(--adn-ink-100)', paddingTop: 12, flexWrap: 'wrap' }}>
                  <Link to={`/clientes/${cliente.id}/campos`} style={linkButtonStyle}>
                    <Settings2 size={13} strokeWidth={1.8} />
                    Configurar campos
                  </Link>
                  {cliente.estado === 'ACTIVO' ? (
                    <button
                      onClick={() => estadoMutation.mutate({ id: cliente.id, estado: 'SUSPENDIDO' })}
                      disabled={enTransicion}
                      style={linkButtonStyle}
                    >
                      Suspender
                    </button>
                  ) : (
                    <>
                      <button
                        onClick={() => estadoMutation.mutate({ id: cliente.id, estado: 'ACTIVO' })}
                        disabled={enTransicion}
                        style={linkButtonStyle}
                      >
                        Reactivar
                      </button>
                      <button
                        onClick={() => handleEliminar(cliente.id, cliente.nombre)}
                        disabled={enTransicion}
                        style={{ ...linkButtonStyle, color: 'var(--adn-danger)' }}
                      >
                        <Trash2 size={13} strokeWidth={1.8} />
                        Eliminar permanentemente
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {!isLoading && clientes?.length === 0 && (
        <p style={{ color: 'var(--adn-ink-500)', fontSize: 13 }}>Todavía no hay clientes dados de alta.</p>
      )}
    </Layout>
  );
}

const primaryButtonStyle = {
  background: 'var(--adn-blue)',
  color: '#fff',
  border: 'none',
  borderRadius: 'var(--adn-radius-md)',
  padding: '10px 16px',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
} as const;

const linkButtonStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  background: 'none',
  border: 'none',
  color: 'var(--adn-blue)',
  fontSize: 12,
  fontWeight: 600,
  cursor: 'pointer',
  padding: 0,
  textDecoration: 'none',
} as const;

const inputStyle = {
  padding: '8px 10px',
  borderRadius: 'var(--adn-radius-sm)',
  border: '1px solid var(--adn-ink-200)',
  fontSize: 13,
} as const;
