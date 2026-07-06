import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronUp, Plus, UserPlus } from 'lucide-react';
import type { Rol } from '@adn/shared';
import { Layout } from '../components/Layout';
import { ApiError } from '../lib/api';
import {
  actualizarUsuario,
  asignarProyecto,
  crearUsuario,
  getAsignaciones,
  getClientes,
  getProyectosDeCliente,
  getUsuarios,
  quitarAsignacion,
} from '../lib/services';

const ROL_LABEL: Record<Rol, string> = {
  ADN_ADMIN: 'Admin ADN',
  COORDINADOR: 'Coordinador',
  AUDITOR: 'Auditor',
};

export function Auditores() {
  const queryClient = useQueryClient();
  const [mostrarForm, setMostrarForm] = useState(false);
  const [expandido, setExpandido] = useState<string | null>(null);

  const { data: usuarios } = useQuery({ queryKey: ['usuarios'], queryFn: getUsuarios });
  // Independiente de ClienteGate: /auditores no cuelga de ese wrapper, así que trae su
  // propia lista (react-query comparte caché con ClienteGate por la misma queryKey).
  const { data: clientes = [] } = useQuery({ queryKey: ['clientes'], queryFn: getClientes });

  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rol, setRol] = useState<'COORDINADOR' | 'AUDITOR'>('AUDITOR');

  const crearMutation = useMutation({
    mutationFn: () => crearUsuario({ nombre, email, password, rol }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['usuarios'] });
      setNombre('');
      setEmail('');
      setPassword('');
      setRol('AUDITOR');
      setMostrarForm(false);
    },
  });

  const toggleActivoMutation = useMutation({
    mutationFn: ({ id, activo }: { id: string; activo: boolean }) => actualizarUsuario(id, { activo }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['usuarios'] }),
  });

  return (
    <Layout>
      <header
        style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}
      >
        <div>
          <p className="eyebrow">AU/ EQUIPO</p>
          <h1 style={{ fontSize: 24 }}>Auditores</h1>
          <p style={{ color: 'var(--adn-ink-500)', fontSize: 13, margin: '4px 0 0' }}>
            Personal de ADN: coordinadores y auditores. Cada auditor tiene un único proyecto activo a la vez —
            al reasignarlo a uno nuevo, se libera automáticamente el anterior.
          </p>
        </div>
        <button onClick={() => setMostrarForm((v) => !v)} style={primaryButtonStyle}>
          <UserPlus size={16} strokeWidth={1.8} />
          Nuevo usuario
        </button>
      </header>

      {mostrarForm && (
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
            gridTemplateColumns: '1fr 1fr 1fr 140px auto',
            gap: 12,
            alignItems: 'end',
          }}
        >
          <label style={labelStyle}>
            Nombre
            <input required value={nombre} onChange={(e) => setNombre(e.target.value)} style={inputStyle} />
          </label>
          <label style={labelStyle}>
            Correo
            <input
              required
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={inputStyle}
            />
          </label>
          <label style={labelStyle}>
            Contraseña inicial
            <input
              required
              minLength={8}
              type="text"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="mínimo 8 caracteres"
              style={inputStyle}
            />
          </label>
          <label style={labelStyle}>
            Rol
            <select value={rol} onChange={(e) => setRol(e.target.value as 'COORDINADOR' | 'AUDITOR')} style={inputStyle}>
              <option value="AUDITOR">Auditor</option>
              <option value="COORDINADOR">Coordinador</option>
            </select>
          </label>
          <button type="submit" disabled={crearMutation.isPending} style={primaryButtonStyle}>
            {crearMutation.isPending ? 'Creando…' : 'Crear'}
          </button>
          {crearMutation.isError && (
            <p style={{ gridColumn: '1 / -1', fontSize: 12, color: 'var(--adn-danger)', margin: 0 }}>
              {crearMutation.error instanceof ApiError ? crearMutation.error.message : 'No se pudo crear el usuario'}
            </p>
          )}
        </form>
      )}

      <div style={{ background: '#fff', border: '1px solid var(--adn-ink-200)', borderRadius: 'var(--adn-radius-lg)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--adn-ink-200)' }}>
              <th style={thStyle}>Nombre</th>
              <th style={thStyle}>Correo</th>
              <th style={thStyle}>Rol</th>
              <th style={thStyle}>Estado</th>
              <th style={thStyle} />
            </tr>
          </thead>
          <tbody>
            {usuarios?.map((usuario) => (
              <>
                <tr key={usuario.id} style={{ borderBottom: '1px solid var(--adn-ink-100)' }}>
                  <td style={tdStyle}>{usuario.nombre}</td>
                  <td style={tdStyle}>{usuario.email}</td>
                  <td style={tdStyle}>{ROL_LABEL[usuario.rol]}</td>
                  <td style={tdStyle}>
                    <span
                      style={{
                        color: usuario.activo ? 'var(--adn-success)' : 'var(--adn-ink-400)',
                        fontWeight: 600,
                        fontSize: 12,
                      }}
                    >
                      {usuario.activo ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td style={{ ...tdStyle, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    <button
                      onClick={() => toggleActivoMutation.mutate({ id: usuario.id, activo: !usuario.activo })}
                      style={linkButtonStyle}
                    >
                      {usuario.activo ? 'Desactivar' : 'Activar'}
                    </button>
                    {usuario.rol === 'AUDITOR' && (
                      <button
                        onClick={() => setExpandido((e) => (e === usuario.id ? null : usuario.id))}
                        style={linkButtonStyle}
                      >
                        Proyecto asignado
                        {expandido === usuario.id ? (
                          <ChevronUp size={14} strokeWidth={1.8} />
                        ) : (
                          <ChevronDown size={14} strokeWidth={1.8} />
                        )}
                      </button>
                    )}
                  </td>
                </tr>
                {expandido === usuario.id && (
                  <tr>
                    <td colSpan={5} style={{ padding: 0, background: 'var(--adn-ink-50)' }}>
                      <AsignacionesPanel usuarioId={usuario.id} clientes={clientes} />
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
        {usuarios?.length === 0 && (
          <p style={{ padding: 24, textAlign: 'center', color: 'var(--adn-ink-500)', fontSize: 13 }}>
            Todavía no hay usuarios.
          </p>
        )}
      </div>
    </Layout>
  );
}

function AsignacionesPanel({
  usuarioId,
  clientes,
}: {
  usuarioId: string;
  clientes: { id: string; nombre: string }[];
}) {
  const queryClient = useQueryClient();
  const [clienteSel, setClienteSel] = useState('');
  const [proyectoSel, setProyectoSel] = useState('');

  const { data: asignaciones } = useQuery({
    queryKey: ['asignaciones', usuarioId],
    queryFn: () => getAsignaciones(usuarioId),
  });

  const { data: proyectosDelCliente } = useQuery({
    queryKey: ['proyectos-cliente', clienteSel],
    queryFn: () => getProyectosDeCliente(clienteSel),
    enabled: !!clienteSel,
  });

  const asignarMutation = useMutation({
    mutationFn: () => asignarProyecto({ usuarioId, clienteId: clienteSel, proyectoId: proyectoSel }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['asignaciones', usuarioId] });
      setProyectoSel('');
    },
  });

  const quitarMutation = useMutation({
    mutationFn: (asignacionId: string) => quitarAsignacion(asignacionId),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['asignaciones', usuarioId] }),
  });

  const asignacionActual = asignaciones?.[0];

  return (
    <div style={{ padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      {asignacionActual ? (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: 12,
            background: '#fff',
            border: '1px solid var(--adn-ink-200)',
            borderRadius: 'var(--adn-radius-sm)',
            padding: '6px 10px',
            maxWidth: 320,
          }}
        >
          <span>{asignacionActual.cliente.nombre}</span>
          <button
            onClick={() => quitarMutation.mutate(asignacionActual.id)}
            style={{ ...linkButtonStyle, color: 'var(--adn-danger)' }}
          >
            Quitar
          </button>
        </div>
      ) : (
        <p style={{ fontSize: 12, color: 'var(--adn-ink-500)', margin: 0 }}>Sin proyecto asignado.</p>
      )}

      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <select
          value={clienteSel}
          onChange={(e) => {
            setClienteSel(e.target.value);
            setProyectoSel('');
          }}
          style={{ ...inputStyle, width: 200 }}
        >
          <option value="">Elegir cliente…</option>
          {clientes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </select>
        <select
          value={proyectoSel}
          onChange={(e) => setProyectoSel(e.target.value)}
          disabled={!clienteSel}
          style={{ ...inputStyle, width: 220 }}
        >
          <option value="">Elegir proyecto…</option>
          {proyectosDelCliente?.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre}
            </option>
          ))}
        </select>
        <button
          onClick={() => asignarMutation.mutate()}
          disabled={!proyectoSel || asignarMutation.isPending}
          style={{ ...primaryButtonStyle, padding: '8px 14px' }}
        >
          <Plus size={14} strokeWidth={1.8} />
          {asignacionActual ? 'Reasignar' : 'Asignar'}
        </button>
      </div>
    </div>
  );
}

const primaryButtonStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
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
  gap: 2,
  background: 'none',
  border: 'none',
  color: 'var(--adn-blue)',
  fontSize: 12,
  fontWeight: 600,
  cursor: 'pointer',
  padding: 0,
} as const;

const labelStyle = { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, fontWeight: 600 } as const;

const inputStyle = {
  padding: '8px 10px',
  borderRadius: 'var(--adn-radius-sm)',
  border: '1px solid var(--adn-ink-200)',
  fontSize: 13,
} as const;

const thStyle = { textAlign: 'left', padding: '10px 16px', fontSize: 11, color: 'var(--adn-ink-500)' } as const;
const tdStyle = { padding: '10px 16px' } as const;
