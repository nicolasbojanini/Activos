import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { ProyectosModule } from '../proyectos/proyectos.module';

@Module({
  imports: [ProyectosModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
