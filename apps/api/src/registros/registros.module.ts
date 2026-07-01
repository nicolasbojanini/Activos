import { Module } from '@nestjs/common';
import { RegistrosController } from './registros.controller';
import { RegistrosService } from './registros.service';
import { ProyectosModule } from '../proyectos/proyectos.module';
import { FilesModule } from '../files/files.module';

@Module({
  imports: [ProyectosModule, FilesModule],
  controllers: [RegistrosController],
  providers: [RegistrosService],
})
export class RegistrosModule {}
