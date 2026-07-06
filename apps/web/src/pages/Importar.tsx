import { useCallback, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import * as XLSX from 'xlsx';
import { UploadCloud, FileSpreadsheet, CheckCircle2, AlertTriangle } from 'lucide-react';
import { CAMPO_IDENTIDAD, type ImportCommitOutput, type ImportPreviewOutput } from '@adn/shared';
import { Layout } from '../components/Layout';
import { useClienteStore } from '../lib/cliente-store';
import { commitImport, getConfiguracionCampos, previewImport } from '../lib/services';
import { ApiError } from '../lib/api';

type Paso = 'cargar' | 'elegir-hoja' | 'mapeo' | 'resultado';

/** Filas de datos de una hoja (excluyendo el encabezado), para mostrarlas al elegir cuál importar. */
function contarFilas(sheet: XLSX.WorkSheet): number {
  if (!sheet['!ref']) return 0;
  return XLSX.utils.decode_range(sheet['!ref']).e.r;
}

/**
 * Excel suele guardar un rango usado ("!ref") mucho más grande que los datos
 * reales — basta con que alguna celda tenga formato/borde aplicado "por si
 * acaso" para que xlsx genere filas fantasma hasta ese límite. Sin este
 * filtro, un archivo con 7.000 filas reales puede reportar 50.000+ "filas
 * detectadas" y el commit intenta validar cada una (todas fallan por falta
 * de código nuevo).
 */
function esFilaVacia(fila: Record<string, unknown>): boolean {
  return Object.values(fila).every((valor) => valor === null || valor === undefined || String(valor).trim() === '');
}

export function Importar() {
  const { proyectoId } = useParams<{ proyectoId: string }>();
  const navigate = useNavigate();
  const clienteId = useClienteStore((s) => s.clienteId);

  const { data: configuracion } = useQuery({
    queryKey: ['configuracion-campos', clienteId],
    queryFn: () => getConfiguracionCampos(clienteId!),
    enabled: !!clienteId,
  });
  const camposVisibles = (configuracion?.campos ?? []).filter((c) => c.visible);
  const camposPersonalizados = (configuracion?.camposPersonalizados ?? []).filter((cp) => cp.visible);

  const [paso, setPaso] = useState<Paso>('cargar');
  const [archivo, setArchivo] = useState<File | null>(null);
  const [workbook, setWorkbook] = useState<XLSX.WorkBook | null>(null);
  const [filas, setFilas] = useState<Record<string, unknown>[]>([]);
  const [preview, setPreview] = useState<ImportPreviewOutput | null>(null);
  const [mapeo, setMapeo] = useState<Record<string, string | null>>({});
  const [resultado, setResultado] = useState<ImportCommitOutput | null>(null);

  const previewMutation = useMutation({
    mutationFn: async ({ file, hoja }: { file: File; hoja: string }) => {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer);
      const sheet = wb.Sheets[hoja];
      const filasParseadas = XLSX.utils
        .sheet_to_json<Record<string, unknown>>(sheet, { defval: null })
        .filter((fila) => !esFilaVacia(fila));

      const previewResult = await previewImport(file, hoja);
      return { previewResult, filasParseadas };
    },
    onSuccess: ({ previewResult, filasParseadas }) => {
      setPreview(previewResult);
      setMapeo(previewResult.mapeoSugerido);
      setFilas(filasParseadas);
      setPaso('mapeo');
    },
  });

  const commitMutation = useMutation({
    mutationFn: () =>
      commitImport({
        proyectoId: proyectoId!,
        archivoNombre: archivo!.name,
        mapeo,
        filas,
      }),
    onSuccess: (data) => {
      setResultado(data);
      setPaso('resultado');
    },
  });

  const handleFile = useCallback(async (file: File) => {
    setArchivo(file);
    const buffer = await file.arrayBuffer();
    const wb = XLSX.read(buffer);
    setWorkbook(wb);
    if (wb.SheetNames.length > 1) {
      setPaso('elegir-hoja');
    } else {
      previewMutation.mutate({ file, hoja: wb.SheetNames[0] });
    }
  }, [previewMutation]);

  const elegirHoja = (hoja: string) => {
    if (archivo) previewMutation.mutate({ file: archivo, hoja });
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  return (
    <Layout>
      <header style={{ marginBottom: 24 }}>
        <p className="eyebrow">AU/ IMPORTAR</p>
        <h1 style={{ fontSize: 24 }}>Importar base de datos de activos</h1>
      </header>

      {paso === 'cargar' && (
        <div
          onDrop={onDrop}
          onDragOver={(e) => e.preventDefault()}
          style={{
            border: '2px dashed var(--adn-ink-300)',
            borderRadius: 'var(--adn-radius-lg)',
            padding: 48,
            textAlign: 'center',
            background: '#fff',
          }}
        >
          <UploadCloud size={32} strokeWidth={1.8} color="var(--adn-blue)" style={{ marginBottom: 12 }} />
          <p style={{ fontWeight: 600, marginBottom: 4 }}>Arrastra tu archivo .xlsx o .csv aquí</p>
          <p style={{ fontSize: 13, color: 'var(--adn-ink-500)', marginBottom: 16 }}>
            o selecciona un archivo desde tu computador
          </p>
          <label
            style={{
              display: 'inline-block',
              background: 'var(--adn-blue)',
              color: '#fff',
              borderRadius: 'var(--adn-radius-md)',
              padding: '10px 20px',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Seleccionar archivo
            <input
              type="file"
              accept=".xlsx,.csv"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFile(file);
              }}
            />
          </label>
          {previewMutation.isPending && <p style={{ marginTop: 16, fontSize: 13 }}>Analizando archivo…</p>}
          {previewMutation.isError && (
            <p style={{ marginTop: 16, fontSize: 13, color: 'var(--adn-danger)' }}>
              {previewMutation.error instanceof ApiError ? previewMutation.error.message : 'No se pudo leer el archivo'}
            </p>
          )}
        </div>
      )}

      {paso === 'elegir-hoja' && workbook && (
        <div
          style={{
            background: '#fff',
            border: '1px solid var(--adn-ink-200)',
            borderRadius: 'var(--adn-radius-lg)',
            padding: 24,
          }}
        >
          <h3 style={{ fontSize: 15, marginBottom: 4 }}>Este archivo tiene varias hojas</h3>
          <p style={{ fontSize: 13, color: 'var(--adn-ink-500)', marginBottom: 16 }}>
            Elige cuál contiene los datos que quieres importar.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {workbook.SheetNames.map((nombre) => (
              <button
                key={nombre}
                onClick={() => elegirHoja(nombre)}
                disabled={previewMutation.isPending}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '12px 16px',
                  borderRadius: 'var(--adn-radius-md)',
                  border: '1px solid var(--adn-ink-200)',
                  background: '#fff',
                  cursor: 'pointer',
                  fontSize: 13,
                  textAlign: 'left',
                }}
              >
                <span style={{ fontWeight: 600 }}>{nombre}</span>
                <span style={{ color: 'var(--adn-ink-500)' }}>
                  {contarFilas(workbook.Sheets[nombre]).toLocaleString('es-CO')} filas
                </span>
              </button>
            ))}
          </div>
          {previewMutation.isPending && <p style={{ marginTop: 16, fontSize: 13 }}>Analizando hoja…</p>}
          {previewMutation.isError && (
            <p style={{ marginTop: 16, fontSize: 13, color: 'var(--adn-danger)' }}>
              {previewMutation.error instanceof ApiError ? previewMutation.error.message : 'No se pudo leer la hoja'}
            </p>
          )}
          <button onClick={() => setPaso('cargar')} style={{ ...secondaryButtonStyle, marginTop: 16 }}>
            Elegir otro archivo
          </button>
        </div>
      )}

      {paso === 'mapeo' && preview && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              background: '#fff',
              border: '1px solid var(--adn-ink-200)',
              borderRadius: 'var(--adn-radius-md)',
              padding: '12px 16px',
            }}
          >
            <FileSpreadsheet size={18} strokeWidth={1.8} color="var(--adn-blue)" />
            <span style={{ fontSize: 13, fontWeight: 600 }}>{archivo?.name}</span>
            <span style={{ fontSize: 12, color: 'var(--adn-ink-500)' }}>· {filas.length} filas detectadas</span>
          </div>

          <div
            style={{
              background: '#fff',
              border: '1px solid var(--adn-ink-200)',
              borderRadius: 'var(--adn-radius-lg)',
              padding: 20,
            }}
          >
            <h3 style={{ fontSize: 15, marginBottom: 16 }}>Mapeo de columnas</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {camposVisibles.map(({ campo, etiqueta, requerido }) => (
                <label key={campo} style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
                  <span style={{ fontWeight: 600 }}>
                    {etiqueta}
                    {requerido && <span style={{ color: 'var(--adn-danger)' }}> *</span>}
                  </span>
                  <select
                    value={mapeo[campo] ?? ''}
                    onChange={(e) => setMapeo((m) => ({ ...m, [campo]: e.target.value || null }))}
                    style={{
                      padding: '8px 10px',
                      borderRadius: 'var(--adn-radius-sm)',
                      border: '1px solid var(--adn-ink-200)',
                      fontSize: 13,
                    }}
                  >
                    <option value="">— No mapear —</option>
                    {preview.columnasDetectadas.map((col) => (
                      <option key={col} value={col}>
                        {col}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
              {camposPersonalizados.map(({ id, etiqueta, requerido }) => {
                const campo = `personalizado:${id}`;
                return (
                  <label key={campo} style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
                    <span style={{ fontWeight: 600 }}>
                      {etiqueta}
                      {requerido && <span style={{ color: 'var(--adn-danger)' }}> *</span>}
                    </span>
                    <select
                      value={mapeo[campo] ?? ''}
                      onChange={(e) => setMapeo((m) => ({ ...m, [campo]: e.target.value || null }))}
                      style={{
                        padding: '8px 10px',
                        borderRadius: 'var(--adn-radius-sm)',
                        border: '1px solid var(--adn-ink-200)',
                        fontSize: 13,
                      }}
                    >
                      <option value="">— No mapear —</option>
                      {preview.columnasDetectadas.map((col) => (
                        <option key={col} value={col}>
                          {col}
                        </option>
                      ))}
                    </select>
                  </label>
                );
              })}
            </div>
          </div>

          <div
            style={{
              background: '#fff',
              border: '1px solid var(--adn-ink-200)',
              borderRadius: 'var(--adn-radius-lg)',
              padding: 20,
              overflowX: 'auto',
            }}
          >
            <h3 style={{ fontSize: 15, marginBottom: 12 }}>Previsualización (primeras filas)</h3>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr>
                  {preview.columnasDetectadas.map((col) => (
                    <th key={col} style={{ textAlign: 'left', padding: '6px 10px', color: 'var(--adn-ink-500)' }}>
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.muestra.map((fila, i) => (
                  <tr key={i} style={{ borderTop: '1px solid var(--adn-ink-100)' }}>
                    {preview.columnasDetectadas.map((col) => (
                      <td key={col} style={{ padding: '6px 10px' }}>
                        {String(fila[col] ?? '—')}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {commitMutation.isError && (
            <p style={{ fontSize: 13, color: 'var(--adn-danger)' }}>
              {commitMutation.error instanceof ApiError ? commitMutation.error.message : 'No se pudo confirmar la importación'}
            </p>
          )}

          <div style={{ display: 'flex', gap: 12 }}>
            <button onClick={() => setPaso('cargar')} style={secondaryButtonStyle}>
              Cancelar
            </button>
            <button
              onClick={() => commitMutation.mutate()}
              disabled={!mapeo[CAMPO_IDENTIDAD] || commitMutation.isPending}
              style={{ ...primaryButtonStyle, opacity: !mapeo[CAMPO_IDENTIDAD] || commitMutation.isPending ? 0.6 : 1 }}
            >
              {commitMutation.isPending ? 'Confirmando…' : 'Confirmar importación'}
            </button>
          </div>
        </div>
      )}

      {paso === 'resultado' && resultado && (
        <div
          style={{
            background: '#fff',
            border: '1px solid var(--adn-ink-200)',
            borderRadius: 'var(--adn-radius-lg)',
            padding: 32,
            textAlign: 'center',
            maxWidth: 480,
          }}
        >
          {resultado.filasError === 0 ? (
            <CheckCircle2 size={40} strokeWidth={1.8} color="var(--adn-success)" style={{ marginBottom: 12 }} />
          ) : (
            <AlertTriangle size={40} strokeWidth={1.8} color="var(--adn-warning)" style={{ marginBottom: 12 }} />
          )}
          <h2 style={{ fontSize: 18, marginBottom: 8 }}>Importación completada</h2>
          <p style={{ fontSize: 13, color: 'var(--adn-ink-500)', marginBottom: 20 }}>
            {resultado.filasCreadas} creados · {resultado.filasActualizadas} actualizados · {resultado.filasError} con
            error, de {resultado.filasTotales} filas totales.
          </p>

          {resultado.erroresJson.length > 0 && (
            <div style={{ textAlign: 'left', fontSize: 12, marginBottom: 20 }}>
              <p style={{ fontWeight: 600, marginBottom: 6 }}>Errores por fila:</p>
              <ul style={{ margin: 0, paddingLeft: 18, color: 'var(--adn-danger)' }}>
                {resultado.erroresJson.slice(0, 10).map((err, i) => (
                  <li key={i}>
                    Fila {err.fila} · {err.campo}: {err.motivo}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <button onClick={() => navigate('/auditorias')} style={primaryButtonStyle}>
            Volver a Auditorías
          </button>
        </div>
      )}
    </Layout>
  );
}

const primaryButtonStyle = {
  background: 'var(--adn-blue)',
  color: '#fff',
  border: 'none',
  borderRadius: 'var(--adn-radius-md)',
  padding: '10px 20px',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
} as const;

const secondaryButtonStyle = {
  background: '#fff',
  color: 'var(--adn-ink-700)',
  border: '1px solid var(--adn-ink-200)',
  borderRadius: 'var(--adn-radius-md)',
  padding: '10px 20px',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
} as const;
