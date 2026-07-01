import { Module } from '@nestjs/common';
import { ReportesController } from './reportes.controller';
import { ReportesService } from './reportes.service';
import { ProyectosModule } from '../proyectos/proyectos.module';

@Module({
  imports: [ProyectosModule],
  controllers: [ReportesController],
  providers: [ReportesService],
})
export class ReportesModule {}
