import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ActivosModule } from './activos/activos.module';
import { AuthModule } from './auth/auth.module';
import { ImportsModule } from './imports/imports.module';
import { PrismaModule } from './prisma/prisma.module';
import { ProyectosModule } from './proyectos/proyectos.module';
import { RegistrosModule } from './registros/registros.module';
import { ReportesModule } from './reportes/reportes.module';
import { UbicacionesModule } from './ubicaciones/ubicaciones.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    ProyectosModule,
    ActivosModule,
    ImportsModule,
    RegistrosModule,
    UbicacionesModule,
    ReportesModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
