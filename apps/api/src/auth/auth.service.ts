import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, type JwtSignOptions } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';
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
    private readonly prisma: PrismaService,
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
    organizacionId: string;
  }) {
    return {
      id: usuario.id,
      nombre: usuario.nombre,
      email: usuario.email,
      rol: usuario.rol,
      organizacionId: usuario.organizacionId,
    };
  }

  async login(dto: LoginDto) {
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

    return {
      accessToken: this.signAccessToken(usuario.id),
      refreshToken: this.signRefreshToken(usuario.id),
      usuario: this.toUsuarioOutput(usuario),
    };
  }

  async refresh(dto: RefreshDto) {
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

    return { accessToken: this.signAccessToken(usuario.id) };
  }

  async me(userId: string) {
    const usuario = await this.prisma.usuario.findUniqueOrThrow({
      where: { id: userId },
      include: { organizacion: true },
    });

    return {
      ...this.toUsuarioOutput(usuario),
      organizacion: {
        id: usuario.organizacion.id,
        nombre: usuario.organizacion.nombre,
      },
    };
  }
}
