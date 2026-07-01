import { Module } from '@nestjs/common';
import { RegistrosController } from './registros.controller';
import { RegistrosService } from './registros.service';
import { ProyectosModule } from '../proyectos/proyectos.module';

@Module({
  imports: [ProyectosModule],
  controllers: [RegistrosController],
  providers: [RegistrosService],
})
export class RegistrosModule {}
