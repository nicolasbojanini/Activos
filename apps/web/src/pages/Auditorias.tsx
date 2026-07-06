import { useMemo, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { flexRender, getCoreRowModel, useReactTable, type ColumnDef } from '@tanstack/react-table';
import { Search, Upload } from 'lucide-react';
import type { ActivoListItemOutput } from '@adn/shared';
import { Layout } from '../components/Layout';
import { EstadoBadge } from '../components/Badge';
import { ApiError } from '../lib/api';
import { crearProyecto, getActivos, getProyectos, getResumenProyecto } from '../lib/services';

const PAGE_SIZE = 10;

export function Auditorias() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [nombreProyecto, setNombreProyecto] = useState('');
  const [fechaCorte, setFechaCorte] = useState('');

  const { data: proyectos, isLoading: proyectosLoading } = useQuery({ queryKey: ['proyectos'], queryFn: getProyectos });
  const proyecto = proyectos?.[0];

  const crearProyectoMutation = useMutation({
    mutationFn: () => crearProyecto({ nombre: nombreProyecto, fechaCorte: new Date(fechaCorte) }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['proyectos'] }),
  });

  const { data: resumen } = useQuery({
    queryKey: ['resumen', proyecto?.id],
    queryFn: () => getResumenProyecto(proyecto!.id),
    enabled: !!proyecto,
  });

  const { data: activos, isLoading: activosLoading } = useQuery({
    queryKey: ['activos', proyecto?.id, q, page],
    queryFn: () => getActivos({ proyectoId: proyecto!.id, q, page, pageSize: PAGE_SIZE }),
    enabled: !!proyecto,
    placeholderData: (prev) => prev,
  });

  const columns = useMemo<ColumnDef<ActivoListItemOutput>[]>(
    () => [
      {
        header: 'Código',
        accessorKey: 'codigoNuevo',
        cell: (info) => (
          <span style={{ fontFamily: 'ui-monospace, monospace', color: 'var(--adn-blue)', fontWeight: 600 }}>
            {info.getValue<string>()}
          </span>
        ),
      },
      { header: 'Activo', accessorKey: 'nombre' },
      {
        header: 'Categoría',
        accessorKey: 'categoria',
        cell: (info) => info.getValue<string>().replace('_', ' '),
      },
      {
        header: 'Ubicación',
        accessorKey: 'ubicacion',
        cell: (info) => info.getValue<ActivoListItemOutput['ubicacion']>()?.sede ?? '—',
      },
      {
        header: 'Auditor',
        accessorKey: 'ultimoAuditor',
        cell: (info) => info.getValue<string | null>() ?? '—',
      },
      {
        header: 'Estado',
        accessorKey: 'estado',
        cell: (info) => <EstadoBadge estado={info.getValue<ActivoListItemOutput['estado']>()} />,
      },
    ],
    [],
  );

  const table = useReactTable({
    data: activos?.data ?? [],
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  const totalPages = activos ? Math.max(1, Math.ceil(activos.total / PAGE_SIZE)) : 1;

  if (!proyecto) {
    if (proyectosLoading) {
      return (
        <Layout>
          <p>Cargando proyecto…</p>
        </Layout>
      );
    }

    return (
      <Layout>
        <header style={{ marginBottom: 24 }}>
          <p className="eyebrow">AU/</p>
          <h1 style={{ fontSize: 24 }}>Crear el primer proyecto de este cliente</h1>
          <p style={{ color: 'var(--adn-ink-500)', fontSize: 13, margin: '4px 0 0' }}>
            Este cliente todavía no tiene ningún proyecto de auditoría. Crea uno para poder importar el inventario
            y empezar a auditar.
          </p>
        </header>

        <form
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            crearProyectoMutation.mutate();
          }}
          style={{
            background: '#fff',
            border: '1px solid var(--adn-ink-200)',
            borderRadius: 'var(--adn-radius-lg)',
            padding: 20,
            display: 'grid',
            gridTemplateColumns: '1fr 220px auto',
            gap: 12,
            alignItems: 'end',
            maxWidth: 720,
          }}
        >
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, fontWeight: 600 }}>
            Nombre del proyecto
            <input
              required
              value={nombreProyecto}
              onChange={(e) => setNombreProyecto(e.target.value)}
              placeholder="Ej. Inventario 2026"
              style={inputStyle}
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, fontWeight: 600 }}>
            Fecha de corte
            <input
              required
              type="date"
              value={fechaCorte}
              onChange={(e) => setFechaCorte(e.target.value)}
              style={inputStyle}
            />
          </label>
          <button type="submit" disabled={crearProyectoMutation.isPending} style={primaryButtonStyle}>
            {crearProyectoMutation.isPending ? 'Creando…' : 'Crear proyecto'}
          </button>
          {crearProyectoMutation.isError && (
            <p style={{ gridColumn: '1 / -1', fontSize: 12, color: 'var(--adn-danger)', margin: 0 }}>
              {crearProyectoMutation.error instanceof ApiError
                ? crearProyectoMutation.error.message
                : 'No se pudo crear el proyecto'}
            </p>
          )}
        </form>
      </Layout>
    );
  }

  return (
    <Layout>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <p className="eyebrow">AU/</p>
          <h1 style={{ fontSize: 24 }}>{proyecto.nombre}</h1>
          <p style={{ color: 'var(--adn-ink-500)', fontSize: 13, margin: '4px 0 0' }}>
            Fecha de corte: {new Date(proyecto.fechaCorte).toLocaleDateString('es-CO', { dateStyle: 'long', timeZone: 'America/Bogota' })}
          </p>
        </div>
        <button
          onClick={() => navigate('/reportes')}
          style={{
            background: 'var(--adn-blue)',
            color: '#fff',
            border: 'none',
            borderRadius: 'var(--adn-radius-md)',
            padding: '10px 20px',
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
            boxShadow: 'var(--shadow-brand)',
          }}
        >
          Descargar reporte
        </button>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
        <div
          style={{
            background: '#fff',
            border: '1px solid var(--adn-ink-200)',
            borderRadius: 'var(--adn-radius-lg)',
            padding: 20,
          }}
        >
          <h3 style={{ fontSize: 15, marginBottom: 4 }}>Base de datos de activos</h3>
          <p style={{ fontSize: 13, color: 'var(--adn-ink-500)', margin: '0 0 16px' }}>
            {resumen?.total ?? '—'} activos · sincronizado con la app
          </p>
          <button
            onClick={() => navigate(`/auditorias/${proyecto.id}/importar`)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              background: 'var(--adn-blue-50)',
              color: 'var(--adn-blue)',
              border: 'none',
              borderRadius: 'var(--adn-radius-md)',
              padding: '10px 16px',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <Upload size={16} strokeWidth={1.8} />
            Importar / reemplazar base de datos
          </button>
        </div>

        <div
          style={{
            background: 'var(--adn-blue)',
            borderRadius: 'var(--adn-radius-lg)',
            padding: 20,
            color: '#fff',
          }}
        >
          <h3 style={{ fontSize: 15, color: '#fff', marginBottom: 12 }}>Avance de la auditoría</h3>
          <div style={{ fontSize: 32, fontWeight: 700, marginBottom: 8 }}>
            {resumen ? Math.round(resumen.pct * 100) : 0}%
          </div>
          <div
            style={{
              height: 6,
              borderRadius: 'var(--adn-radius-pill)',
              background: 'rgba(255,255,255,0.25)',
              overflow: 'hidden',
              marginBottom: 12,
            }}
          >
            <div
              style={{
                height: '100%',
                width: `${resumen ? resumen.pct * 100 : 0}%`,
                background: '#fff',
                borderRadius: 'var(--adn-radius-pill)',
              }}
            />
          </div>
          <div style={{ display: 'flex', gap: 16, fontSize: 12, flexWrap: 'wrap' }}>
            <span>Auditados: {resumen?.auditados ?? 0}</span>
            <span>Diferencias: {resumen?.diferencias ?? 0}</span>
            <span>Faltantes: {resumen?.faltantes ?? 0}</span>
            <span>Activos nuevos: {resumen?.noRegistrados ?? 0}</span>
            <span>Pendientes: {resumen?.pendientes ?? 0}</span>
          </div>
        </div>
      </div>

      <div
        style={{
          background: '#fff',
          border: '1px solid var(--adn-ink-200)',
          borderRadius: 'var(--adn-radius-lg)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 20px',
            borderBottom: '1px solid var(--adn-ink-200)',
          }}
        >
          <h3 style={{ fontSize: 15 }}>Activos del inventario</h3>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              border: '1px solid var(--adn-ink-200)',
              borderRadius: 'var(--adn-radius-md)',
              padding: '6px 12px',
              minWidth: 260,
            }}
          >
            <Search size={16} strokeWidth={1.8} color="var(--adn-ink-400)" />
            <input
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
              placeholder="Buscar por código o nombre…"
              style={{ border: 'none', outline: 'none', fontSize: 13, width: '100%' }}
            />
          </div>
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    style={{
                      textAlign: 'left',
                      padding: '10px 20px',
                      color: 'var(--adn-ink-500)',
                      fontWeight: 600,
                      fontSize: 11,
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                    }}
                  >
                    {flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {activosLoading && (
              <tr>
                <td colSpan={columns.length} style={{ padding: 20, textAlign: 'center', color: 'var(--adn-ink-500)' }}>
                  Cargando activos…
                </td>
              </tr>
            )}
            {!activosLoading && table.getRowModel().rows.length === 0 && (
              <tr>
                <td colSpan={columns.length} style={{ padding: 20, textAlign: 'center', color: 'var(--adn-ink-500)' }}>
                  No hay activos que coincidan con la búsqueda.
                </td>
              </tr>
            )}
            {table.getRowModel().rows.map((row) => (
              <tr
                key={row.id}
                onClick={() => navigate(`/activos/${row.original.id}`)}
                style={{ borderTop: '1px solid var(--adn-ink-100)', cursor: 'pointer' }}
              >
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} style={{ padding: '10px 20px' }}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 20px',
            fontSize: 12,
            color: 'var(--adn-ink-500)',
          }}
        >
          <span>
            Página {page} de {totalPages} · {activos?.total ?? 0} activos
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              style={pagerButtonStyle}
            >
              Anterior
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              style={pagerButtonStyle}
            >
              Siguiente
            </button>
          </div>
        </div>
      </div>
    </Layout>
  );
}

const pagerButtonStyle = {
  border: '1px solid var(--adn-ink-200)',
  background: '#fff',
  borderRadius: 'var(--adn-radius-md)',
  padding: '6px 12px',
  fontSize: 12,
  fontWeight: 600,
  cursor: 'pointer',
} as const;

const inputStyle = {
  padding: '8px 10px',
  borderRadius: 'var(--adn-radius-sm)',
  border: '1px solid var(--adn-ink-200)',
  fontSize: 13,
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
