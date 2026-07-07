import { eq } from 'drizzle-orm';
import { uploadAsync } from 'expo-file-system/legacy';
import type { RegistroAuditoriaInput } from '@adn/shared';
import { db } from '../db/client';
import { activosLocal, colaRegistros } from '../db/schema';
import { crearRegistro, confirmarFotosRegistro } from './services';
import { archivoLocalFoto, eliminarFotoLocal, type FotoCapturada } from './fotos';

type FotoLocalConDimensiones = Pick<FotoCapturada, 'clientPhotoId' | 'etiqueta' | 'orden' | 'ancho' | 'alto'>;

interface EncolarInput extends Omit<RegistroAuditoriaInput, 'fotos'> {
  codigoAnteriorSnapshot?: string;
  nombreSnapshot?: string;
  fotos: FotoLocalConDimensiones[];
}

/**
 * Guarda la mutación localmente primero (optimista) y dispara la
 * sincronización en segundo plano, sin esperarla — subir varias fotos por
 * una red de celular puede tardar bastante, y bloquear al auditor con un
 * spinner hasta que eso termine es exactamente lo que este diseño
 * "local-first" busca evitar. Si la sincronización falla o está offline,
 * queda en la cola para el siguiente `sincronizarPendientes()`. Nunca lanza:
 * el auditor sigue trabajando sin importar el estado de la red.
 */
export async function encolarRegistro(input: EncolarInput): Promise<void> {
  await db.insert(colaRegistros).values({
    clientId: input.clientId,
    proyectoId: input.proyectoId,
    activoId: input.activoId,
    codigoAnteriorSnapshot: input.codigoAnteriorSnapshot ?? null,
    nombreSnapshot: input.nombreSnapshot ?? null,
    estado: input.estado,
    estadoFisico: input.estadoFisico ?? null,
    cambiosJson: input.cambios ? JSON.stringify(input.cambios) : null,
    nota: input.nota ?? null,
    auditadoEn: input.auditadoEn.toISOString(),
    fotosJson: JSON.stringify(input.fotos ?? []),
    synced: 0,
    createdAt: new Date().toISOString(),
  });

  void intentarSincronizar(input.clientId, input);
}

function aRegistroAuditoriaInput(input: EncolarInput): RegistroAuditoriaInput {
  return {
    ...input,
    fotos: input.fotos.map(({ clientPhotoId, etiqueta, orden }) => ({ clientPhotoId, etiqueta, orden })),
  };
}

/** Sube a S3 las fotos ya capturadas y confirma sus metadatos. Requiere que crearRegistro ya haya devuelto `uploads`. */
async function subirYConfirmarFotos(
  registroId: string,
  uploads: { clientPhotoId: string; uploadUrl: string; s3Key: string }[],
  fotosLocal: FotoLocalConDimensiones[],
): Promise<boolean> {
  if (uploads.length === 0) return true;

  // Subir en paralelo, no una por una — con 4 fotos por activo, subirlas
  // secuencialmente en una red de celular es lo que hacía que confirmar un
  // activo se sintiera lento (~1 minuto). uploadAsync transmite el archivo
  // directo desde disco (nativo), sin materializar los ~400KB de cada JPEG
  // como Uint8Array en el heap de JS — con varias fotos en paralelo eso
  // eran picos de memoria innecesarios en teléfonos de gama baja.
  const resultados = await Promise.all(
    uploads.map(async (upload) => {
      const archivo = archivoLocalFoto(upload.clientPhotoId);
      if (!archivo.exists) return null; // ya se subió antes o no aplica

      const metadata = fotosLocal.find((f) => f.clientPhotoId === upload.clientPhotoId);
      const respuesta = await uploadAsync(upload.uploadUrl, archivo.uri, {
        httpMethod: 'PUT',
        headers: { 'Content-Type': 'image/jpeg' },
      });
      if (respuesta.status < 200 || respuesta.status >= 300) return undefined;

      return {
        clientPhotoId: upload.clientPhotoId,
        s3Key: upload.s3Key,
        ancho: metadata?.ancho ?? 0,
        alto: metadata?.alto ?? 0,
        bytes: archivo.size,
      };
    }),
  );

  if (resultados.some((r) => r === undefined)) return false;
  const confirmaciones = resultados.filter((r): r is NonNullable<typeof r> => r !== null);

  if (confirmaciones.length === 0) return true;

  await confirmarFotosRegistro(registroId, confirmaciones);
  for (const c of confirmaciones) eliminarFotoLocal(c.clientPhotoId);
  return true;
}

async function intentarSincronizar(clientId: string, input: EncolarInput): Promise<boolean> {
  try {
    const { registro, uploads } = await crearRegistro(aRegistroAuditoriaInput(input));
    const fotosSubidas = await subirYConfirmarFotos(registro.id, uploads, input.fotos);
    if (!fotosSubidas) {
      console.warn('[sync] subida de fotos falló, registro queda pendiente', clientId);
      return false;
    }

    await marcarComoSincronizado(clientId, input);
    return true;
  } catch (err) {
    console.warn('[sync] intentarSincronizar falló', clientId, err);
    return false;
  }
}

async function marcarComoSincronizado(clientId: string, input: EncolarInput) {
  await db.update(colaRegistros).set({ synced: 1 }).where(eq(colaRegistros.clientId, clientId));

  if (input.activoId) {
    await db
      .update(activosLocal)
      .set({ estadoServidor: input.estado })
      .where(eq(activosLocal.id, input.activoId));
  }
}

function filaAEncolarInput(fila: typeof colaRegistros.$inferSelect): EncolarInput {
  return {
    clientId: fila.clientId,
    proyectoId: fila.proyectoId,
    activoId: fila.activoId,
    estado: fila.estado as RegistroAuditoriaInput['estado'],
    estadoFisico: (fila.estadoFisico as RegistroAuditoriaInput['estadoFisico']) ?? undefined,
    cambios: fila.cambiosJson ? JSON.parse(fila.cambiosJson) : undefined,
    nota: fila.nota,
    auditadoEn: new Date(fila.auditadoEn),
    fotos: JSON.parse(fila.fotosJson) as FotoLocalConDimensiones[],
  };
}

export interface ResultadoSincronizacion {
  intentados: number;
  exitosos: number;
  fallidos: number;
}

/**
 * Recorre toda la cola pendiente e intenta sincronizar cada mutación
 * (idempotente por clientId). En lotes de 4 concurrentes: tras una mañana
 * sin señal la cola puede traer decenas de registros y subirlos en serie es
 * ~4× más lento; no más de 4 a la vez para no acercarse al rate limit
 * global de la API (100 req/min) contando las subidas de fotos.
 */
export async function sincronizarPendientes(): Promise<ResultadoSincronizacion> {
  const pendientes = await db.select().from(colaRegistros).where(eq(colaRegistros.synced, 0));

  const CONCURRENCIA = 4;
  let exitosos = 0;
  for (let i = 0; i < pendientes.length; i += CONCURRENCIA) {
    const lote = pendientes.slice(i, i + CONCURRENCIA);
    const resultados = await Promise.all(
      lote.map((fila) => intentarSincronizar(fila.clientId, filaAEncolarInput(fila))),
    );
    exitosos += resultados.filter(Boolean).length;
  }

  return { intentados: pendientes.length, exitosos, fallidos: pendientes.length - exitosos };
}
