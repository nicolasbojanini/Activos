import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerModule } from '@nestjs/throttler';
import { SentryGlobalFilter, SentryModule } from '@sentry/nestjs/setup';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ActivosModule } from './activos/activos.module';
import { AuthModule } from './auth/auth.module';
import { ClientesModule } from './clientes/clientes.module';
import { ConfiguracionCamposModule } from './configuracion-campos/configuracion-campos.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { ImportsModule } from './imports/imports.module';
import { PrismaModule } from './prisma/prisma.module';
import { ProyectosModule } from './proyectos/proyectos.module';
import { RegistrosModule } from './registros/registros.module';
import { ReportesModule } from './reportes/reportes.module';
import { UbicacionesModule } from './ubicaciones/ubicaciones.module';
import { UsuariosModule } from './usuarios/usuarios.module';
import { UserThrottlerGuard } from './common/guards/user-throttler.guard';

@Module({
  imports: [
    SentryModule.forRoot(),
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 100 }]),
    // Para que UserThrottlerGuard pueda verificar el token y contar el límite
    // por usuario en vez de por IP (ver el guard).
    JwtModule.register({}),
    PrismaModule,
    AuthModule,
    ClientesModule,
    ConfiguracionCamposModule,
    DashboardModule,
    UsuariosModule,
    ProyectosModule,
    ActivosModule,
    ImportsModule,
    RegistrosModule,
    UbicacionesModule,
    ReportesModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_GUARD, useClass: UserThrottlerGuard },
    { provide: APP_FILTER, useClass: SentryGlobalFilter },
  ],
})
export class AppModule {}
