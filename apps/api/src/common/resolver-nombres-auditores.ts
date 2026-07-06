import { ControlPrismaService } from '../prisma/control-prisma.service';

/**
 * RegistroAuditoria.auditorId (tenant DB) referencia un Usuario que vive en
 * la control DB — bases de datos físicas distintas, sin FK real posible.
 * Se resuelve en dos pasos: se traen los registros del tenant, y acá se
 * hace un batch fetch a la control DB por los ids distintos encontrados.
 */
export async function resolverNombresAuditores(
  control: ControlPrismaService,
  auditorIds: string[],
): Promise<Map<string, string>> {
  const idsUnicos = [...new Set(auditorIds)];
  if (idsUnicos.length === 0) return new Map();

  const usuarios = await control.usuario.findMany({
    where: { id: { in: idsUnicos } },
    select: { id: true, nombre: true },
  });

  return new Map(usuarios.map((u) => [u.id, u.nombre]));
}
