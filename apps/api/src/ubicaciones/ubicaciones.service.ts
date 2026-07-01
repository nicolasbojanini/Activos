import { Injectable } from '@nestjs/common';
import type { UbicacionOutput } from '@adn/shared';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UbicacionesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(organizacionId: string): Promise<UbicacionOutput[]> {
    const ubicaciones = await this.prisma.ubicacion.findMany({
      where: { organizacionId },
      orderBy: { sede: 'asc' },
    });
    return ubicaciones.map((u) => ({
      id: u.id,
      sede: u.sede,
      detalle: u.detalle,
    }));
  }
}
