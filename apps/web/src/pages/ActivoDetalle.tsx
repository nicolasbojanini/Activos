import { useNavigate, useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft } from 'lucide-react';
import type { ActivoDetailOutput, CampoPersonalizadoOutput, ConfiguracionCampoOutput, RegistroHistorialOutput } from '@adn/shared';
import { Layout } from '../components/Layout';
import { EstadoBadge } from '../components/Badge';
import { useClienteStore } from '../lib/cliente-store';
import { getActivo, getConfiguracionCampos, getHistorialActivo } from '../lib/services';

const ESTADO_FISICO_LABEL: Record<string, string> = {
  BUENO: 'Bueno',
  REGULAR: 'Regular',
  MALO: 'Malo',
  BAJA: 'De baja',
};

const CAMPO_VALOR: Record<string, (activo: ActivoDetailOutput) => string> = {
  codigoNuevo: (a) => a.codigoNuevo,
  codigoAnterior: (a) => a.codigoAnterior ?? '—',
  codigoControl: (a) => a.codigoControl ?? '—',
  nombre: (a) => a.nombre ?? '—',
  descripcion: (a) => a.descripcion ?? '—',
  ubicacion: (a) => a.ubicacion?.sede ?? '—',
  color: (a) => a.color ?? '—',
  medidas: (a) => a.medidas ?? '—',
  capacidad: (a) => a.capacidad ?? '—',
  marca: (a) => a.marca ?? '—',
  modelo: (a) => a.modelo ?? '—',
  serie: (a) => a.serie ?? '—',
  estadoFisico: (a) => ESTADO_FISICO_LABEL[a.estadoFisico] ?? a.estadoFisico,
  responsable: (a) => a.responsable ?? '—',
  centroCosto: (a) => a.centroCosto ?? '—',
  categoria: (a) => a.categoria.replace('_', ' '),
  fechaAdquisicion: (a) => (a.fechaAdquisicion ? new Date(a.fechaAdquisicion).toLocaleDateString('es-CO') : '—'),
  valorLibros: (a) => (a.valorLibros ? `$${Number(a.valorLibros).toLocaleString('es-CO')}` : '—'),
  proveedor: (a) => a.proveedor ?? '—',
  vidaUtilMeses: (a) => (a.vidaUtilMeses ? `${a.vidaUtilMeses} meses` : '—'),
};

function ficha(activo: ActivoDetailOutput, campos: ConfiguracionCampoOutput[], camposPersonalizados: CampoPersonalizadoOutput[]) {
  const filas = campos
    .filter((c) => c.visible)
    .map((c) => ({ label: c.etiqueta, valor: CAMPO_VALOR[c.campo]?.(activo) ?? '—' }));

  const personalizados = camposPersonalizados
    .filter((cp) => cp.visible)
    .map((cp) => ({ label: cp.etiqueta, valor: activo.camposPersonalizados?.[cp.id] }))
    .filter((f): f is { label: string; valor: string } => !!f.valor);

  return [...filas, ...personalizados];
}

export function ActivoDetalle() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const clienteId = useClienteStore((s) => s.clienteId);

  const { data: activo } = useQuery({ queryKey: ['activo-web', id], queryFn: () => getActivo(id!), enabled: !!id });
  const { data: historial } = useQuery({
    queryKey: ['historial-activo', id],
    queryFn: () => getHistorialActivo(id!),
    enabled: !!id,
  });
  const { data: configuracion } = useQuery({
    queryKey: ['configuracion-campos', clienteId],
    queryFn: () => getConfiguracionCampos(clienteId!),
    enabled: !!clienteId,
  });

  const fotos = (historial ?? []).flatMap((registro) =>
    registro.fotos.map((foto) => ({ ...foto, registroId: registro.id, fecha: registro.auditadoEn })),
  );

  if (!activo) {
    return (
      <Layout>
        <p>Cargando…</p>
      </Layout>
    );
  }

  return (
    <Layout>
      <button
        onClick={() => navigate(-1)}
        style={{
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
        }}
      >
        <ChevronLeft size={16} />
        Volver
      </button>

      <header style={{ marginBottom: 24 }}>
        <p className="eyebrow">AC/ {activo.codigoNuevo}</p>
        <h1 style={{ fontSize: 22, marginBottom: 8 }}>{activo.nombre}</h1>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <EstadoBadge estado={activo.estado} />
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              background: 'var(--adn-ink-100)',
              color: 'var(--adn-ink-600)',
              borderRadius: 999,
              padding: '3px 10px',
            }}
          >
            Estado físico: {ESTADO_FISICO_LABEL[activo.estadoFisico]}
          </span>
        </div>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, alignItems: 'start' }}>
        <div
          style={{
            background: '#fff',
            border: '1px solid var(--adn-ink-200)',
            borderRadius: 'var(--adn-radius-lg)',
            overflow: 'hidden',
          }}
        >
          <h3 style={{ fontSize: 15, padding: '16px 20px 0' }}>Ficha</h3>
          {ficha(activo, configuracion?.campos ?? [], configuracion?.camposPersonalizados ?? []).map((campo, i) => (
            <div
              key={campo.label}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                padding: '10px 20px',
                borderTop: i === 0 ? 'none' : '1px solid var(--adn-ink-100)',
                fontSize: 13,
              }}
            >
              <span style={{ color: 'var(--adn-ink-500)' }}>{campo.label}</span>
              <span style={{ fontWeight: 600 }}>{campo.valor}</span>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div
            style={{
              background: '#fff',
              border: '1px solid var(--adn-ink-200)',
              borderRadius: 'var(--adn-radius-lg)',
              padding: 20,
            }}
          >
            <h3 style={{ fontSize: 15, marginBottom: 12 }}>Galería de fotos</h3>
            {fotos.length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--adn-ink-500)' }}>Aún no hay fotos registradas.</p>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                {fotos.map((foto) => (
                  <a key={foto.id} href={foto.url} target="_blank" rel="noreferrer" style={{ display: 'block' }}>
                    <img
                      src={foto.url}
                      alt={foto.etiqueta ?? ''}
                      style={{
                        width: '100%',
                        aspectRatio: '1',
                        objectFit: 'cover',
                        borderRadius: 'var(--adn-radius-sm)',
                        border: '1px solid var(--adn-ink-200)',
                      }}
                    />
                  </a>
                ))}
              </div>
            )}
          </div>

          <div
            style={{
              background: '#fff',
              border: '1px solid var(--adn-ink-200)',
              borderRadius: 'var(--adn-radius-lg)',
              padding: 20,
            }}
          >
            <h3 style={{ fontSize: 15, marginBottom: 12 }}>Línea de tiempo de auditoría</h3>
            {(historial ?? []).length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--adn-ink-500)' }}>Este activo aún no ha sido auditado.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {(historial ?? []).map((registro) => (
                  <TimelineEntry key={registro.id} registro={registro} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}

function TimelineEntry({ registro }: { registro: RegistroHistorialOutput }) {
  const cambiosEntries = registro.cambios ? Object.entries(registro.cambios) : [];

  return (
    <div style={{ borderLeft: '2px solid var(--adn-ink-200)', paddingLeft: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <EstadoBadge estado={registro.estado} />
        <span style={{ fontSize: 12, color: 'var(--adn-ink-500)' }}>
          {new Date(registro.auditadoEn).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' })}
        </span>
      </div>
      <p style={{ fontSize: 13, fontWeight: 600, margin: '0 0 4px' }}>{registro.auditor}</p>
      {registro.nota && <p style={{ fontSize: 13, color: 'var(--adn-ink-700)', margin: '0 0 4px' }}>{registro.nota}</p>}
      {cambiosEntries.length > 0 && (
        <ul style={{ margin: '4px 0 0', paddingLeft: 16, fontSize: 12, color: 'var(--adn-ink-500)' }}>
          {cambiosEntries.map(([campo, diff]) => (
            <li key={campo}>
              {campo}: {String((diff as { antes: unknown }).antes ?? '—')} → {String((diff as { despues: unknown }).despues ?? '—')}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
