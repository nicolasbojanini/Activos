import { useEffect, useState, type FormEvent } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, Trash2 } from 'lucide-react';
import { CAMPO_IDENTIDAD, type ConfiguracionCampoOutput } from '@adn/shared';
import { Layout } from '../components/Layout';
import { useAuthStore } from '../lib/auth-store';
import { ApiError } from '../lib/api';
import {
  actualizarCampoPersonalizado,
  actualizarConfiguracionCampos,
  crearCampoPersonalizado,
  eliminarCampoPersonalizado,
  getConfiguracionCampos,
} from '../lib/services';

type CampoEstado = Pick<ConfiguracionCampoOutput, 'campo' | 'etiqueta' | 'visible' | 'requerido'>;

export function ConfigurarCampos() {
  const { clienteId } = useParams<{ clienteId: string }>();
  const usuario = useAuthStore((s) => s.usuario);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [campos, setCampos] = useState<CampoEstado[] | null>(null);
  const [nuevaEtiqueta, setNuevaEtiqueta] = useState('');
  const [nuevoRequerido, setNuevoRequerido] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['configuracion-campos', clienteId],
    queryFn: () => getConfiguracionCampos(clienteId!),
    enabled: !!clienteId,
  });

  useEffect(() => {
    if (data) setCampos(data.campos.map((c) => ({ campo: c.campo, etiqueta: c.etiqueta, visible: c.visible, requerido: c.requerido })));
  }, [data]);

  const guardarMutation = useMutation({
    mutationFn: () =>
      actualizarConfiguracionCampos(clienteId!, {
        campos: campos!.map(({ campo, visible, requerido }) => ({ campo, visible, requerido })),
      }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['configuracion-campos', clienteId] }),
  });

  const crearPersonalizadoMutation = useMutation({
    mutationFn: () => crearCampoPersonalizado(clienteId!, { etiqueta: nuevaEtiqueta, requerido: nuevoRequerido }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['configuracion-campos', clienteId] });
      setNuevaEtiqueta('');
      setNuevoRequerido(false);
    },
  });

  const eliminarPersonalizadoMutation = useMutation({
    mutationFn: (campoId: string) => eliminarCampoPersonalizado(clienteId!, campoId),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['configuracion-campos', clienteId] }),
  });

  const actualizarPersonalizadoMutation = useMutation({
    mutationFn: ({ campoId, visible }: { campoId: string; visible: boolean }) =>
      actualizarCampoPersonalizado(clienteId!, campoId, { visible }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['configuracion-campos', clienteId] }),
  });

  if (usuario && usuario.rol !== 'ADN_ADMIN') {
    return <Navigate to="/auditorias" replace />;
  }

  const toggle = (campo: string, key: 'visible' | 'requerido') => {
    setCampos((prev) =>
      prev?.map((c) => {
        if (c.campo !== campo) return c;
        if (campo === CAMPO_IDENTIDAD) return c; // codigoNuevo no se puede ocultar ni volver opcional
        const siguiente = { ...c, [key]: !c[key] };
        // si se oculta, no tiene sentido dejarlo marcado como obligatorio
        if (key === 'visible' && !siguiente.visible) siguiente.requerido = false;
        return siguiente;
      }) ?? null,
    );
  };

  return (
    <Layout>
      <button onClick={() => navigate('/clientes')} style={backButtonStyle}>
        <ChevronLeft size={16} />
        Volver a Clientes
      </button>

      <header style={{ marginBottom: 24 }}>
        <p className="eyebrow">CL/ CAMPOS</p>
        <h1 style={{ fontSize: 24 }}>Campos de la ficha de activo</h1>
        <p style={{ color: 'var(--adn-ink-500)', fontSize: 13, margin: '4px 0 0' }}>
          Elige qué campos se muestran al importar/auditar y cuáles son obligatorios. Aplica a todos los inventarios
          de este cliente. "{CAMPO_IDENTIDAD}" es el identificador único del activo y no se puede ocultar ni volver
          opcional.
        </p>
      </header>

      {isLoading || !campos ? (
        <p style={{ fontSize: 13, color: 'var(--adn-ink-500)' }}>Cargando…</p>
      ) : (
        <>
          <div
            style={{
              background: '#fff',
              border: '1px solid var(--adn-ink-200)',
              borderRadius: 'var(--adn-radius-lg)',
              overflow: 'hidden',
              marginBottom: 20,
            }}
          >
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px 100px', padding: '10px 20px', fontSize: 11, fontWeight: 600, color: 'var(--adn-ink-500)', borderBottom: '1px solid var(--adn-ink-100)' }}>
              <span>Campo</span>
              <span>Visible</span>
              <span>Obligatorio</span>
            </div>
            {campos.map((campo) => {
              const bloqueado = campo.campo === CAMPO_IDENTIDAD;
              return (
                <div
                  key={campo.campo}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 100px 100px',
                    padding: '10px 20px',
                    fontSize: 13,
                    borderTop: '1px solid var(--adn-ink-100)',
                    alignItems: 'center',
                    opacity: bloqueado ? 0.7 : 1,
                  }}
                >
                  <span>{campo.etiqueta}</span>
                  <input
                    type="checkbox"
                    checked={campo.visible}
                    disabled={bloqueado}
                    onChange={() => toggle(campo.campo, 'visible')}
                  />
                  <input
                    type="checkbox"
                    checked={campo.requerido}
                    disabled={bloqueado || !campo.visible}
                    onChange={() => toggle(campo.campo, 'requerido')}
                  />
                </div>
              );
            })}
          </div>

          {guardarMutation.isError && (
            <p style={{ fontSize: 12, color: 'var(--adn-danger)', marginBottom: 12 }}>
              {guardarMutation.error instanceof ApiError ? guardarMutation.error.message : 'No se pudo guardar la configuración'}
            </p>
          )}

          <button
            onClick={() => guardarMutation.mutate()}
            disabled={guardarMutation.isPending}
            style={{ ...primaryButtonStyle, marginBottom: 32, opacity: guardarMutation.isPending ? 0.6 : 1 }}
          >
            {guardarMutation.isPending ? 'Guardando…' : 'Guardar configuración'}
          </button>

          <div
            style={{
              background: '#fff',
              border: '1px solid var(--adn-ink-200)',
              borderRadius: 'var(--adn-radius-lg)',
              padding: 20,
            }}
          >
            <h3 style={{ fontSize: 15, marginBottom: 4 }}>Campos personalizados</h3>
            <p style={{ fontSize: 12, color: 'var(--adn-ink-500)', marginBottom: 16 }}>
              Para casos especiales que no cubre el catálogo estándar.
            </p>

            {data?.camposPersonalizados.map((cp) => (
              <div
                key={cp.id}
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderTop: '1px solid var(--adn-ink-100)', fontSize: 13 }}
              >
                <span>
                  {cp.etiqueta}
                  {cp.requerido && <span style={{ color: 'var(--adn-danger)' }}> *</span>}
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--adn-ink-500)', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={cp.visible}
                      disabled={actualizarPersonalizadoMutation.isPending}
                      onChange={() => actualizarPersonalizadoMutation.mutate({ campoId: cp.id, visible: !cp.visible })}
                    />
                    Visible
                  </label>
                  <button
                    onClick={() => eliminarPersonalizadoMutation.mutate(cp.id)}
                    disabled={eliminarPersonalizadoMutation.isPending}
                    style={iconButtonStyle}
                  >
                    <Trash2 size={14} strokeWidth={1.8} />
                  </button>
                </div>
              </div>
            ))}
            {data?.camposPersonalizados.length === 0 && (
              <p style={{ fontSize: 12, color: 'var(--adn-ink-500)', margin: 0 }}>Todavía no hay campos personalizados.</p>
            )}

            <form
              onSubmit={(e: FormEvent) => {
                e.preventDefault();
                if (nuevaEtiqueta.trim()) crearPersonalizadoMutation.mutate();
              }}
              style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--adn-ink-100)' }}
            >
              <input
                value={nuevaEtiqueta}
                onChange={(e) => setNuevaEtiqueta(e.target.value)}
                placeholder="Nombre del campo nuevo"
                style={{ flex: 1, padding: '8px 10px', borderRadius: 'var(--adn-radius-sm)', border: '1px solid var(--adn-ink-200)', fontSize: 13 }}
              />
              <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, whiteSpace: 'nowrap' }}>
                <input type="checkbox" checked={nuevoRequerido} onChange={(e) => setNuevoRequerido(e.target.checked)} />
                Obligatorio
              </label>
              <button type="submit" disabled={crearPersonalizadoMutation.isPending || !nuevaEtiqueta.trim()} style={primaryButtonStyle}>
                Agregar
              </button>
            </form>
          </div>
        </>
      )}
    </Layout>
  );
}

const backButtonStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  background: 'none',
  border: 'none',
  color: 'var(--adn-ink-500)',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
  marginBottom: 16,
  padding: 0,
} as const;

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

const iconButtonStyle = {
  display: 'flex',
  alignItems: 'center',
  background: 'none',
  border: 'none',
  color: 'var(--adn-danger)',
  cursor: 'pointer',
  padding: 4,
} as const;
