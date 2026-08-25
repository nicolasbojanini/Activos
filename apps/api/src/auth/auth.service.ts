import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, type JwtSignOptions } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { ControlPrismaService } from '../prisma/control-prisma.service';
import type { LoginDto } from './dto/login.dto';
import type { RefreshDto } from './dto/refresh.dto';
import type { AuthenticatedUser } from './types/authenticated-user';

interface JwtRefreshPayload {
  sub: string;
  type: 'refresh';
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: ControlPrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  private signAccessToken(userId: string) {
    return this.jwt.sign({ sub: userId, type: 'access' }, {
      secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      expiresIn: this.config.get<string>('JWT_ACCESS_EXPIRES_IN', '15m'),
    } as JwtSignOptions);
  }

  private signRefreshToken(userId: string) {
    return this.jwt.sign({ sub: userId, type: 'refresh' }, {
      secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
      expiresIn: this.config.get<string>('JWT_REFRESH_EXPIRES_IN', '30d'),
    } as JwtSignOptions);
  }

  private toUsuarioOutput(usuario: {
    id: string;
    nombre: string;
    email: string;
    rol: AuthenticatedUser['rol'];
    activo: boolean;
  }) {
    return {
      id: usuario.id,
      nombre: usuario.nombre,
      email: usuario.email,
      rol: usuario.rol,
      activo: usuario.activo,
    };
  }

  /**
   * Guarda el build de la app (header X-App-Build, ver ApiFetch en mobile) del
   * usuario que acaba de autenticarse — permite ubicar desde el backend quién
   * sigue en una versión vieja para pedirle que actualice. Solo en login y
   * refresh, no en cada request: con el access token durando 15 minutos,
   * cualquier dispositivo en uso activo lo refresca solo con esa cadencia, sin
   * necesidad de escribir en cada llamada. Best-effort: nunca debe convertir un
   * login válido en un error por un problema al guardar este dato secundario.
   */
  private registrarBuildApp(usuarioId: string, buildApp: string | undefined) {
    if (!buildApp) return;
    const valor = buildApp.trim().slice(0, 32);
    if (!valor) return;

    void this.prisma.usuario
      .update({
        where: { id: usuarioId },
        data: { ultimoBuildApp: valor, ultimoAccesoApp: new Date() },
      })
      .catch(() => {
        // No romper el login/refresh por esto: es solo información para soporte.
      });
  }

  async login(dto: LoginDto, buildApp?: string) {
    const usuario = await this.prisma.usuario.findUnique({
      where: { email: dto.email },
    });
    if (!usuario || !usuario.activo) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    const passwordValida = await argon2.verify(
      usuario.passwordHash,
      dto.password,
    );
    if (!passwordValida) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    this.registrarBuildApp(usuario.id, buildApp);

    return {
      accessToken: this.signAccessToken(usuario.id),
      refreshToken: this.signRefreshToken(usuario.id),
      usuario: this.toUsuarioOutput(usuario),
    };
  }

  async refresh(dto: RefreshDto, buildApp?: string) {
    let payload: JwtRefreshPayload;
    try {
      payload = this.jwt.verify<JwtRefreshPayload>(dto.refreshToken, {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Refresh token inválido o expirado');
    }

    if (payload.type !== 'refresh') {
      throw new UnauthorizedException('Refresh token inválido');
    }

    const usuario = await this.prisma.usuario.findUnique({
      where: { id: payload.sub },
    });
    if (!usuario || !usuario.activo) {
      throw new UnauthorizedException('Usuario no encontrado o inactivo');
    }

    this.registrarBuildApp(usuario.id, buildApp);

    return { accessToken: this.signAccessToken(usuario.id) };
  }

  async me(userId: string) {
    const usuario = await this.prisma.usuario.findUniqueOrThrow({
      where: { id: userId },
    });

    return this.toUsuarioOutput(usuario);
  }
}
