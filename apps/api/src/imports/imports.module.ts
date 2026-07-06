import { Module } from '@nestjs/common';
import { ImportsController } from './imports.controller';
import { ImportsService } from './imports.service';
import { ProyectosModule } from '../proyectos/proyectos.module';
import { ConfiguracionCamposModule } from '../configuracion-campos/configuracion-campos.module';

@Module({
  imports: [ProyectosModule, ConfiguracionCamposModule],
  controllers: [ImportsController],
  providers: [ImportsService],
})
export class ImportsModule {}
