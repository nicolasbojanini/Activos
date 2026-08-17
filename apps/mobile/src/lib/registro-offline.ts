import { eq } from 'drizzle-orm';
import { uploadAsync } from 'expo-file-system/legacy';
import type { RegistroAuditoriaInput } from '@adn/shared';
import { db } from '../db/client';
import { activosLocal, colaRegistros } from '../db/schema';
import { aplicarCambiosAlEspejoLocal } from '../db/sync';
import { crearRegistro, confirmarFotosRegistro } from './services';
import { archivarFotosLocal, archivoLocalFoto, eliminarFotoLocal, type FotoCapturada } from './fotos';

type FotoLocalConDimensiones = Pick<FotoCapturada, 'clientPhotoId' | 'etiqueta' | 'orden' | 'ancho' | 'alto'>;

interface EncolarInput extends Omit<RegistroAuditoriaInput, 'fotos'> {
  codigoAnteriorSnapshot?: string;
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
    codigoAnteriorSnapshot: input.codigoAnteriorSnapshot ?? null,
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

  // El espejo local refleja de una vez lo capturado (misma regla que aplica
  // el backend al sincronizar), así la ficha y las sugerencias dinámicas ven
  // el valor nuevo sin esperar el viaje de ida y vuelta al servidor. Para un
  // NO_REGISTRADO todavía no hay fila local que actualizar: el activo se crea
  // en el servidor y llega en el siguiente delta.
  if (input.activoId && input.cambios) {
    await aplicarCambiosAlEspejoLocal(input.activoId, input.cambios);
  }

  // Respaldo permanente (nunca se borra, ni después de sincronizar) y luego la
  // sincronización, ambos en segundo plano y en ESE orden.
  //
  // Antes el respaldo se esperaba acá, antes de devolver el control: por cada
  // foto lee el JPEG entero como base64 y lo escribe por el Storage Access
  // Framework con la API legacy de expo-file-system, o sea medio megabyte
  // cruzando el bridge de React Native, hasta cuatro veces seguidas. Con eso
  // adentro, tocar "Guardar" congelaba la pantalla mientras corría — y es
  // trabajo best-effort que no tiene por qué hacer esperar al auditor.
  //
  // Encadenado y no en paralelo a propósito: subirYConfirmarFotos borra la copia
  // de trabajo al confirmar cada foto, así que si corrieran a la vez, con buena
  // señal el respaldo podría encontrarse el archivo ya borrado y saltárselo en
  // silencio.
  void archivarFotosLocal(input.codigoAnteriorSnapshot ?? null, input.codigoNuevoSnapshot, input.fotos).finally(
    () => {
      void intentarSincronizar(input.clientId, input);
    },
  );
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
      // El backend (crearRegistro) ya filtra `uploads` a solo las fotos con
      // bytes:null — si esta foto está acá, el servidor SIGUE esperándola. Que
      // el archivo de trabajo no exista nunca es "ya se subió antes": es
      // pérdida real (archivo borrado antes de confirmar) y hay que tratarla
      // como fallo para que se reintente, no darla por buena en silencio (ver
      // incidente Decameron DMZ 00465-00476, agosto 2026).
      if (!archivo.exists) {
        console.warn('[sync] foto sin archivo local al subir, se reintentará', upload.clientPhotoId);
        return undefined;
      }

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

/**
 * El registro (estado/campos/nota) y las fotos se confirman en pasos
 * separados: crearRegistro es liviano y casi siempre pasa con señal débil;
 * subir varias fotos JPEG seguidas es mucho más sensible a la misma señal y
 * falla mucho más seguido. Antes, si las fotos fallaban, ni siquiera se
 * marcaba `registroSincronizado` — así que un lote con buena señal para el
 * registro pero mala para fotos pesadas quedaba mostrando "70 pendientes"
 * indefinidamente, aunque los 70 registros YA estuvieran guardados en el
 * servidor (visto en producción con Decameron). Ahora se marca
 * `registroSincronizado` apenas crearRegistro responde, sin esperar a las
 * fotos — contarPendientesSync() cuenta solo lo que de verdad no llegó.
 */
async function intentarSincronizar(clientId: string, input: EncolarInput): Promise<boolean> {
  try {
    const { registro, uploads } = await crearRegistro(aRegistroAuditoriaInput(input));
    await marcarRegistroConfirmado(clientId);

    const fotosSubidas = await subirYConfirmarFotos(registro.id, uploads, input.fotos);
    if (!fotosSubidas) {
      console.warn('[sync] registro confirmado, subida de fotos falló — reintenta después', clientId);
      return false;
    }

    await marcarComoSincronizado(clientId, input);
    return true;
  } catch (err) {
    console.warn('[sync] intentarSincronizar falló', clientId, err);
    return false;
  }
}

async function marcarRegistroConfirmado(clientId: string) {
  await db.update(colaRegistros).set({ registroSincronizado: 1 }).where(eq(colaRegistros.clientId, clientId));
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
