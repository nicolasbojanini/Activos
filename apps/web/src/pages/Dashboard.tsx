import { useMemo, useState } from 'react';
import { Navigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ChevronDown, ChevronUp } from 'lucide-react';
import type { ProyectoGerencialOutput } from '@adn/shared';
import { Layout } from '../components/Layout';
import { useAuthStore } from '../lib/auth-store';
import { getDashboardGerencial } from '../lib/services';

export function Dashboard() {
  const usuario = useAuthStore((s) => s.usuario);
  const [expandido, setExpandido] = useState<string | null>(null);

  const { data: proyectos, isLoading } = useQuery({
    queryKey: ['dashboard-gerencial'],
    queryFn: getDashboardGerencial,
  });

  const kpis = useMemo(() => {
    if (!proyectos || proyectos.length === 0) {
      return { totalProyectos: 0, totalAuditores: 0, avancePromedio: 0, totalActivos: 0 };
    }
    const auditoresUnicos = new Set(proyectos.flatMap((p) => p.auditores.map((a) => a.auditorId)));
    const avancePromedio = proyectos.reduce((acc, p) => acc + p.resumen.pct, 0) / proyectos.length;
    const totalActivos = proyectos.reduce((acc, p) => acc + p.resumen.total, 0);
    return {
      totalProyectos: proyectos.length,
      totalAuditores: auditoresUnicos.size,
      avancePromedio,
      totalActivos,
    };
  }, [proyectos]);

  if (usuario && usuario.rol !== 'ADN_ADMIN') {
    return <Navigate to="/auditorias" replace />;
  }

  return (
    <Layout>
      <header style={{ marginBottom: 24 }}>
        <p className="eyebrow">DA/ GERENCIAL</p>
        <h1 style={{ fontSize: 24 }}>Panel gerencial</h1>
        <p style={{ color: 'var(--adn-ink-500)', fontSize: 13, margin: '4px 0 0' }}>
          Resumen de todos los proyectos en curso, de todos los clientes, con el rendimiento de cada auditor.
        </p>
      </header>

      {isLoading ? (
        <p style={{ color: 'var(--adn-ink-500)' }}>Cargando…</p>
      ) : !proyectos || proyectos.length === 0 ? (
        <p style={{ color: 'var(--adn-ink-500)' }}>No hay ningún proyecto en curso todavía.</p>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
            <KpiCard label="Proyectos en curso" value={kpis.totalProyectos} />
            <KpiCard label="Auditores activos" value={kpis.totalAuditores} />
            <KpiCard label="Avance promedio" value={`${Math.round(kpis.avancePromedio * 100)}%`} />
            <KpiCard label="Total activos" value={kpis.totalActivos.toLocaleString('es-CO')} />
          </div>

          <div
            style={{
              background: '#fff',
              border: '1px solid var(--adn-ink-200)',
              borderRadius: 'var(--adn-radius-lg)',
              padding: 20,
              marginBottom: 24,
            }}
          >
            <h3 style={{ fontSize: 15, marginBottom: 12 }}>Avance por proyecto</h3>
            <ResponsiveContainer width="100%" height={Math.max(180, proyectos.length * 40)}>
              <BarChart data={proyectos.map((p) => ({ nombre: `${p.clienteNombre} · ${p.proyectoNombre}`, avance: Math.round(p.resumen.pct * 100) }))} layout="vertical" margin={{ left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" domain={[0, 100]} unit="%" fontSize={12} />
                <YAxis type="category" dataKey="nombre" width={220} fontSize={12} />
                <Tooltip formatter={(value) => `${value}%`} />
                <Bar dataKey="avance" fill="var(--adn-blue)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div style={{ background: '#fff', border: '1px solid var(--adn-ink-200)', borderRadius: 'var(--adn-radius-lg)', overflow: 'hidden' }}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1.5fr 1fr 100px 140px 160px 32px',
                padding: '10px 20px',
                fontSize: 11,
                fontWeight: 600,
                color: 'var(--adn-ink-500)',
                borderBottom: '1px solid var(--adn-ink-100)',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
              }}
            >
              <span>Proyecto</span>
              <span>Cliente</span>
              <span>Avance</span>
              <span>Auditores asignados</span>
              <span>Rendimiento equipo/día</span>
              <span />
            </div>
            {proyectos.map((p) => (
              <ProyectoRow
                key={p.proyectoId}
                proyecto={p}
                expandido={expandido === p.proyectoId}
                onToggle={() => setExpandido((e) => (e === p.proyectoId ? null : p.proyectoId))}
              />
            ))}
          </div>
        </>
      )}
    </Layout>
  );
}

function KpiCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div style={{ background: '#fff', border: '1px solid var(--adn-ink-200)', borderRadius: 'var(--adn-radius-lg)', padding: 16 }}>
      <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--adn-black)' }}>{value}</div>
      <div style={{ fontSize: 12, color: 'var(--adn-ink-500)' }}>{label}</div>
    </div>
  );
}

function ProyectoRow({
  proyecto,
  expandido,
  onToggle,
}: {
  proyecto: ProyectoGerencialOutput;
  expandido: boolean;
  onToggle: () => void;
}) {
  const auditoresOrdenados = [...proyecto.auditores].sort((a, b) => b.promedioPorDia - a.promedioPorDia);

  return (
    <div style={{ borderTop: '1px solid var(--adn-ink-100)' }}>
      <div
        onClick={onToggle}
        style={{
          display: 'grid',
          gridTemplateColumns: '1.5fr 1fr 100px 140px 160px 32px',
          padding: '12px 20px',
          fontSize: 13,
          alignItems: 'center',
          cursor: 'pointer',
        }}
      >
        <span style={{ fontWeight: 600 }}>{proyecto.proyectoNombre}</span>
        <span style={{ color: 'var(--adn-ink-500)' }}>{proyecto.clienteNombre}</span>
        <span style={{ fontWeight: 600, color: 'var(--adn-blue)' }}>{Math.round(proyecto.resumen.pct * 100)}%</span>
        <span>{proyecto.auditoresAsignados}</span>
        <span style={{ fontWeight: 600 }}>{proyecto.promedioEquipoPorDia} registros/día</span>
        {expandido ? <ChevronUp size={16} strokeWidth={1.8} /> : <ChevronDown size={16} strokeWidth={1.8} />}
      </div>

      {expandido && (
        <div style={{ background: 'var(--adn-ink-50)', padding: '4px 20px 16px' }}>
          {auditoresOrdenados.length === 0 ? (
            <p style={{ fontSize: 12, color: 'var(--adn-ink-500)', margin: '8px 0' }}>
              Todavía no hay auditores asignados a este proyecto.
            </p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, marginTop: 8 }}>
              <thead>
                <tr>
                  <th style={auditorThStyle}>Auditor</th>
                  <th style={auditorThStyle}>Registros procesados</th>
                  <th style={auditorThStyle}>Días activos</th>
                  <th style={auditorThStyle}>Promedio por día</th>
                </tr>
              </thead>
              <tbody>
                {auditoresOrdenados.map((a) => (
                  <tr key={a.auditorId} style={{ borderTop: '1px solid var(--adn-ink-200)' }}>
                    <td style={auditorTdStyle}>{a.auditorNombre}</td>
                    <td style={auditorTdStyle}>{a.registros}</td>
                    <td style={auditorTdStyle}>{a.diasActivos}</td>
                    <td style={{ ...auditorTdStyle, fontWeight: 600 }}>{a.promedioPorDia}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p style={{ fontSize: 11, color: 'var(--adn-ink-400)', margin: '10px 0 0' }}>
            Promedio por día (de cada auditor) = sus registros procesados ÷ sus días con al menos un registro. El
            "Rendimiento equipo/día" de la fila comprimida no es el promedio de estos valores — es el equipo entero
            tratado como un solo auditor: total de registros de todos ÷ días distintos en que cualquiera del equipo
            trabajó (un día en que coincidieron dos auditores cuenta una sola vez).
          </p>
        </div>
      )}
    </div>
  );
}

const auditorThStyle = {
  textAlign: 'left',
  padding: '6px 12px',
  color: 'var(--adn-ink-500)',
  fontWeight: 600,
  fontSize: 11,
} as const;

const auditorTdStyle = { padding: '8px 12px' } as const;
