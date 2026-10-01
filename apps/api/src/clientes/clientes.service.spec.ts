import {
  BadRequestException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { ClientesService } from './clientes.service';
import { dropTenantDatabase } from '../../scripts/db-admin';

jest.mock('../../scripts/provision-tenant', () => ({
  provisionTenant: jest.fn(),
}));
jest.mock('../../scripts/db-admin', () => ({
  dropTenantDatabase: jest.fn(),
}));

const cliente = {
  id: 'cli1',
  nombre: 'Cliente Uno',
  dbHost: 'db',
  dbPort: 5432,
  dbName: 'adn_tenant_x',
  estado: 'SUSPENDIDO',
};

/** Páginas de fotos que devuelve el tenant, una por llamada a findMany. */
function armarServicio(paginasDeFotos: { id: string; s3Key: string }[][]) {
  const llamadas: string[] = [];
  const consultas: Record<string, unknown>[] = [];
  const findMany = jest.fn((args: Record<string, unknown>) => {
    consultas.push(args);
    llamadas.push('leer-fotos');
    return Promise.resolve(paginasDeFotos.shift() ?? []);
  });
  const control = {
    cliente: {
      findUnique: jest.fn().mockResolvedValue(cliente),
      delete: jest.fn(),
    },
    asignacionProyecto: { deleteMany: jest.fn() },
    configuracionCampo: { deleteMany: jest.fn() },
    campoPersonalizado: { deleteMany: jest.fn() },
    campoUbicacion: { deleteMany: jest.fn() },
    $transaction: jest.fn().mockResolvedValue(undefined),
  };
  const tenants = {
    evict: jest.fn().mockResolvedValue(undefined),
    conClienteDeMantenimiento: jest.fn(
      (_c: unknown, fn: (t: unknown) => Promise<number>) =>
        fn({ foto: { findMany } }),
    ),
  };
  const s3 = {
    eliminarObjetos: jest.fn((keys: string[]) => {
      llamadas.push(`s3:${keys.length}`);
      return Promise.resolve();
    }),
  };
  (dropTenantDatabase as jest.Mock).mockImplementation(() => {
    llamadas.push('drop-db');
    return Promise.resolve();
  });
  const service = new ClientesService(
    control as never,
    tenants as never,
    s3 as never,
  );
  return { service, control, s3, consultas, llamadas };
}

describe('ClientesService.eliminar', () => {
  beforeEach(() => jest.clearAllMocks());

  it('borra las fotos de MinIO antes de dropear la base y luego las filas de control', async () => {
    const { service, control, s3, llamadas } = armarServicio([
      [
        { id: 'a', s3Key: 'fotos/r1/1.jpg' },
        { id: 'b', s3Key: 'fotos/r1/2.jpg' },
      ],
      [{ id: 'c', s3Key: 'fotos/r2/1.jpg' }],
    ]);

    await service.eliminar('cli1');

    expect(llamadas).toEqual([
      'leer-fotos',
      's3:2',
      'leer-fotos',
      's3:1',
      'leer-fotos',
      'drop-db',
    ]);
    expect(s3.eliminarObjetos).toHaveBeenNthCalledWith(1, [
      'fotos/r1/1.jpg',
      'fotos/r1/2.jpg',
    ]);
    expect(s3.eliminarObjetos).toHaveBeenNthCalledWith(2, ['fotos/r2/1.jpg']);
    expect(control.$transaction).toHaveBeenCalledTimes(1);
  });

  it('pagina con cursor sobre el id de la última foto leída', async () => {
    const { service, consultas } = armarServicio([
      [{ id: 'a', s3Key: 'k1' }],
      [{ id: 'b', s3Key: 'k2' }],
    ]);

    await service.eliminar('cli1');

    // La primera lectura no lleva cursor; las siguientes sí, sobre la última foto leída.
    expect(consultas).toHaveLength(3);
    expect(consultas[0]).not.toHaveProperty('cursor');
    expect(consultas[1]).toMatchObject({ cursor: { id: 'a' }, skip: 1 });
    expect(consultas[2]).toMatchObject({ cursor: { id: 'b' }, skip: 1 });
  });

  it('si MinIO falla NO dropea la base ni borra las filas de control', async () => {
    const { service, control, s3 } = armarServicio([
      [{ id: 'a', s3Key: 'k1' }],
    ]);
    s3.eliminarObjetos.mockRejectedValueOnce(new Error('minio caído'));

    await expect(service.eliminar('cli1')).rejects.toBeInstanceOf(
      InternalServerErrorException,
    );

    expect(dropTenantDatabase).not.toHaveBeenCalled();
    expect(control.$transaction).not.toHaveBeenCalled();
  });

  it('un cliente sin fotos se elimina igual (no llama a MinIO)', async () => {
    const { service, s3 } = armarServicio([[]]);

    await service.eliminar('cli1');

    expect(s3.eliminarObjetos).not.toHaveBeenCalled();
    expect(dropTenantDatabase).toHaveBeenCalledWith('adn_tenant_x');
  });

  it('rechaza un cliente que no está suspendido sin tocar nada', async () => {
    const { service, control, s3 } = armarServicio([]);
    control.cliente.findUnique.mockResolvedValueOnce({
      ...cliente,
      estado: 'ACTIVO',
    });

    await expect(service.eliminar('cli1')).rejects.toBeInstanceOf(
      BadRequestException,
    );

    expect(s3.eliminarObjetos).not.toHaveBeenCalled();
    expect(dropTenantDatabase).not.toHaveBeenCalled();
  });

  it('rechaza un cliente inexistente', async () => {
    const { service, control } = armarServicio([]);
    control.cliente.findUnique.mockResolvedValueOnce(null);

    await expect(service.eliminar('nope')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
