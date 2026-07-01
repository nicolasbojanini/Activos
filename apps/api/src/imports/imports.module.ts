import { Module } from '@nestjs/common';
import { ImportsController } from './imports.controller';
import { ImportsService } from './imports.service';
import { ProyectosModule } from '../proyectos/proyectos.module';

@Module({
  imports: [ProyectosModule],
  controllers: [ImportsController],
  providers: [ImportsService],
})
export class ImportsModule {}
