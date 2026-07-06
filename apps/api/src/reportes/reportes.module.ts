import { Module } from '@nestjs/common';
import { ReportesController } from './reportes.controller';
import { ReportesService } from './reportes.service';
import { ProyectosModule } from '../proyectos/proyectos.module';
import { FilesModule } from '../files/files.module';
import { ConfiguracionCamposModule } from '../configuracion-campos/configuracion-campos.module';

@Module({
  imports: [ProyectosModule, FilesModule, ConfiguracionCamposModule],
  controllers: [ReportesController],
  providers: [ReportesService],
})
export class ReportesModule {}
