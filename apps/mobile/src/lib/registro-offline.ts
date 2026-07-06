import { eq } from 'drizzle-orm';
import type { RegistroAuditoriaInput } from '@adn/shared';
import { db } from '../db/client';
import { activosLocal, colaRegistros } from '../db/schema';
import { crearRegistro, confirmarFotosRegistro } from './services';
import { archivoLocalFoto, eliminarFotoLocal, type FotoCapturada } from './fotos';

type FotoLocalConDimensiones = Pick<FotoCapturada, 'clientPhotoId' | 'etiqueta' | 'orden' | 'ancho' | 'alto'>;

interface EncolarInput extends Omit<RegistroAuditoriaInput, 'fotos'> {
  codigoNuevoSnapshot?: string;
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
    codigoNuevoSnapshot: input.codigoNuevoSnapshot ?? null,
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
  // activo se sintiera lento (~1 minuto).
  const resultados = await Promise.all(
    uploads.map(async (upload) => {
      const archivo = archivoLocalFoto(upload.clientPhotoId);
      if (!archivo.exists) return null; // ya se subió antes o no aplica

      const metadata = fotosLocal.find((f) => f.clientPhotoId === upload.clientPhotoId);
      const bytes = await archivo.bytes();
      const respuesta = await fetch(upload.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': 'image/jpeg' },
        body: bytes,
      });
      if (!respuesta.ok) return undefined;

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

/** Recorre toda la cola pendiente e intenta sincronizar cada mutación (idempotente por clientId). */
export async function sincronizarPendientes(): Promise<ResultadoSincronizacion> {
  const pendientes = await db.select().from(colaRegistros).where(eq(colaRegistros.synced, 0));

  let exitosos = 0;
  for (const fila of pendientes) {
    const ok = await intentarSincronizar(fila.clientId, filaAEncolarInput(fila));
    if (ok) exitosos++;
  }

  return { intentados: pendientes.length, exitosos, fallidos: pendientes.length - exitosos };
}
