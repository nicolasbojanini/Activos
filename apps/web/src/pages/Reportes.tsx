import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { Download, FileSpreadsheet, FileText, Images, Table } from 'lucide-react';
import { colors } from '@adn/ui-tokens';
import { Layout } from '../components/Layout';
import { fotosZipDescargaUrl, getProyectos, getResumenProyecto, reporteDescargaUrl } from '../lib/services';
import { descargarArchivo } from '../lib/api';

const FORMATOS = [
  { formato: 'xlsx', label: 'Excel (.xlsx)', icon: FileSpreadsheet },
  { formato: 'pdf', label: 'PDF', icon: FileText },
  { formato: 'csv', label: 'CSV', icon: Table },
] as const;

export function Reportes() {
  const [descargando, setDescargando] = useState<string | null>(null);

  const { data: proyectos } = useQuery({ queryKey: ['proyectos'], queryFn: getProyectos });
  const proyecto = proyectos?.[0];

  const { data: resumen } = useQuery({
    queryKey: ['resumen', proyecto?.id],
    queryFn: () => getResumenProyecto(proyecto!.id),
    enabled: !!proyecto,
  });

  const handleDescargar = async (formato: string) => {
    if (!proyecto) return;
    setDescargando(formato);
    try {
      await descargarArchivo(reporteDescargaUrl(proyecto.id, formato));
    } finally {
      setDescargando(null);
    }
  };

  const handleDescargarFotos = async () => {
    if (!proyecto) return;
    setDescargando('fotos');
    try {
      await descargarArchivo(fotosZipDescargaUrl(proyecto.id));
    } finally {
      setDescargando(null);
    }
  };

  const datosGrafica = resumen
    ? [
        { name: 'Auditados', value: resumen.auditados, color: colors.state.success },
        { name: 'Diferencias', value: resumen.diferencias, color: colors.state.warning },
        { name: 'Faltantes', value: resumen.faltantes, color: colors.state.danger },
        { name: 'Pendientes', value: resumen.pendientes, color: colors.ink[300] },
      ].filter((d) => d.value > 0)
    : [];

  const kpis = [
    { label: 'Total activos', value: resumen?.total ?? 0, color: colors.brand.black },
    { label: 'Auditados', value: resumen?.auditados ?? 0, color: colors.state.success },
    { label: 'Diferencias', value: resumen?.diferencias ?? 0, color: colors.state.warning },
    { label: 'Faltantes', value: resumen?.faltantes ?? 0, color: colors.state.danger },
    { label: 'No registrados', value: resumen?.noRegistrados ?? 0, color: colors.brand.blue },
  ];

  if (!proyecto) {
    return (
      <Layout>
        <p>Cargando…</p>
      </Layout>
    );
  }

  return (
    <Layout>
      <header style={{ marginBottom: 24 }}>
        <p className="eyebrow">RE/</p>
        <h1 style={{ fontSize: 24 }}>Reportes</h1>
        <p style={{ color: 'var(--adn-ink-500)', fontSize: 13, margin: '4px 0 0' }}>{proyecto.nombre}</p>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 16, marginBottom: 24 }}>
        {kpis.map((kpi) => (
          <div
            key={kpi.label}
            style={{
              background: '#fff',
              border: '1px solid var(--adn-ink-200)',
              borderRadius: 'var(--adn-radius-lg)',
              padding: 16,
            }}
          >
            <div style={{ fontSize: 24, fontWeight: 700, color: kpi.color }}>{kpi.value}</div>
            <div style={{ fontSize: 12, color: 'var(--adn-ink-500)' }}>{kpi.label}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div
          style={{
            background: '#fff',
            border: '1px solid var(--adn-ink-200)',
            borderRadius: 'var(--adn-radius-lg)',
            padding: 20,
          }}
        >
          <h3 style={{ fontSize: 15, marginBottom: 12 }}>Avance de la auditoría</h3>
          {datosGrafica.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--adn-ink-500)' }}>Aún no hay datos para graficar.</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={datosGrafica} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80} paddingAngle={2}>
                  {datosGrafica.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          )}
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 12 }}>
            {datosGrafica.map((d) => (
              <span key={d.name} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                <span style={{ width: 8, height: 8, borderRadius: 4, background: d.color, display: 'inline-block' }} />
                {d.name}: {d.value}
              </span>
            ))}
          </div>
        </div>

        <div
          style={{
            background: '#fff',
            border: '1px solid var(--adn-ink-200)',
            borderRadius: 'var(--adn-radius-lg)',
            padding: 20,
          }}
        >
          <h3 style={{ fontSize: 15, marginBottom: 4 }}>Descargar reporte</h3>
          <p style={{ fontSize: 13, color: 'var(--adn-ink-500)', marginBottom: 16 }}>
            Incluye estado por activo, diferencias, faltantes y activos no registrados con auditor y fecha.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {FORMATOS.map(({ formato, label, icon: Icon }) => (
              <button
                key={formato}
                onClick={() => void handleDescargar(formato)}
                disabled={descargando !== null}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  border: '1px solid var(--adn-ink-200)',
                  borderRadius: 'var(--adn-radius-md)',
                  padding: '10px 16px',
                  background: '#fff',
                  cursor: descargando ? 'default' : 'pointer',
                  fontSize: 13,
                  fontWeight: 600,
                  opacity: descargando && descargando !== formato ? 0.5 : 1,
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Icon size={16} strokeWidth={1.8} color="var(--adn-blue)" />
                  {label}
                </span>
                <Download size={14} strokeWidth={1.8} color="var(--adn-ink-400)" />
              </button>
            ))}
            <button
              onClick={() => void handleDescargarFotos()}
              disabled={descargando !== null}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                border: '1px solid var(--adn-ink-200)',
                borderRadius: 'var(--adn-radius-md)',
                padding: '10px 16px',
                background: '#fff',
                cursor: descargando ? 'default' : 'pointer',
                fontSize: 13,
                fontWeight: 600,
                opacity: descargando && descargando !== 'fotos' ? 0.5 : 1,
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Images size={16} strokeWidth={1.8} color="var(--adn-blue)" />
                Fotos de los activos (.zip)
              </span>
              <Download size={14} strokeWidth={1.8} color="var(--adn-ink-400)" />
            </button>
          </div>
        </div>
      </div>
    </Layout>
  );
}
