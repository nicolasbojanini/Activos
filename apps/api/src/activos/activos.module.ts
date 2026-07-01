import { Module } from '@nestjs/common';
import { ActivosController } from './activos.controller';
import { ActivosService } from './activos.service';
import { ProyectosModule } from '../proyectos/proyectos.module';
import { FilesModule } from '../files/files.module';

@Module({
  imports: [ProyectosModule, FilesModule],
  controllers: [ActivosController],
  providers: [ActivosService],
})
export class ActivosModule {}
