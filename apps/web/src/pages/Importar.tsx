import { useCallback, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useMutation } from '@tanstack/react-query';
import * as XLSX from 'xlsx';
import { UploadCloud, FileSpreadsheet, CheckCircle2, AlertTriangle } from 'lucide-react';
import { CAMPOS_ACTIVO_IMPORT, type ImportCommitOutput, type ImportPreviewOutput } from '@adn/shared';
import { Layout } from '../components/Layout';
import { commitImport, previewImport } from '../lib/services';
import { ApiError } from '../lib/api';

type Paso = 'cargar' | 'mapeo' | 'resultado';

export function Importar() {
  const { proyectoId } = useParams<{ proyectoId: string }>();
  const navigate = useNavigate();

  const [paso, setPaso] = useState<Paso>('cargar');
  const [archivo, setArchivo] = useState<File | null>(null);
  const [filas, setFilas] = useState<Record<string, unknown>[]>([]);
  const [preview, setPreview] = useState<ImportPreviewOutput | null>(null);
  const [mapeo, setMapeo] = useState<Record<string, string | null>>({});
  const [resultado, setResultado] = useState<ImportCommitOutput | null>(null);

  const previewMutation = useMutation({
    mutationFn: async (file: File) => {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer);
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const filasParseadas = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null });

      const previewResult = await previewImport(file);
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

  const handleFile = useCallback((file: File) => {
    setArchivo(file);
    previewMutation.mutate(file);
  }, [previewMutation]);

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
              {CAMPOS_ACTIVO_IMPORT.map(({ campo, etiqueta, requerido }) => (
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
              disabled={!mapeo.placa || commitMutation.isPending}
              style={{ ...primaryButtonStyle, opacity: !mapeo.placa || commitMutation.isPending ? 0.6 : 1 }}
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
