import { Module } from '@nestjs/common';
import { ActivosController } from './activos.controller';
import { ActivosService } from './activos.service';
import { ProyectosModule } from '../proyectos/proyectos.module';

@Module({
  imports: [ProyectosModule],
  controllers: [ActivosController],
  providers: [ActivosService],
})
export class ActivosModule {}
