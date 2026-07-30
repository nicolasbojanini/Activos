import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  InjectThrottlerOptions,
  InjectThrottlerStorage,
  ThrottlerGuard,
  type ThrottlerModuleOptions,
  type ThrottlerStorage,
} from '@nestjs/throttler';
import { Reflector } from '@nestjs/core';

interface JwtAccessPayload {
  sub?: string;
  type?: string;
}

/**
 * Cuenta el límite por USUARIO autenticado, no por IP.
 *
 * Con el tracker por IP que trae `ThrottlerGuard` de fábrica, una cuadrilla
 * entera de auditores trabajando en la misma bodega —todos detrás del mismo
 * NAT de la oficina o del mismo nodo de la red celular— comparte un solo
 * presupuesto de 100 req/min: el primero que sincroniza una tanda de
 * registros con sus fotos consume el cupo de todos, y a los demás les empieza
 * a fallar la sincronización sin que haya nada mal en su dispositivo.
 *
 * El token se VERIFICA acá en vez de leer `request.user`: los guards globales
 * corren antes que el `JwtAuthGuard` de cada controller, así que en este
 * punto Passport todavía no pobló `request.user`. Y verificar en serio (no
 * solo decodificar) es lo que evita que alguien se fabrique tokens al vuelo
 * para estrenar un cupo limpio en cada request y saltarse el límite por
 * completo.
 *
 * Las rutas anónimas (login, refresh) y cualquier token inválido o vencido
 * siguen contando por IP — ahí todavía no hay usuario, y el límite por IP es
 * justamente la protección que se busca contra fuerza bruta.
 */
@Injectable()
export class UserThrottlerGuard extends ThrottlerGuard {
  private readonly secret: string;

  // Los dos primeros parámetros van con decorador explícito porque sus tipos
  // no son clases inyectables: `ThrottlerGuard` los declara así en su propio
  // constructor, y una subclase con constructor propio no hereda esos
  // decoradores. Sin ellos Nest intenta resolverlos por tipo (`Object`) y la
  // aplicación no arranca.
  constructor(
    @InjectThrottlerOptions() options: ThrottlerModuleOptions,
    @InjectThrottlerStorage() storageService: ThrottlerStorage,
    reflector: Reflector,
    private readonly jwt: JwtService,
    config: ConfigService,
  ) {
    super(options, storageService, reflector);
    this.secret = config.getOrThrow<string>('JWT_ACCESS_SECRET');
  }

  protected getTracker(req: Record<string, unknown>): Promise<string> {
    const headers = req.headers as Record<string, string | undefined>;
    const authorization = headers?.authorization;

    if (authorization?.startsWith('Bearer ')) {
      try {
        const payload = this.jwt.verify<JwtAccessPayload>(
          authorization.slice('Bearer '.length),
          { secret: this.secret },
        );
        if (payload.type === 'access' && payload.sub) {
          return Promise.resolve(`usuario:${payload.sub}`);
        }
      } catch {
        // Token vencido, mal firmado o ilegible: se cuenta por IP, igual que
        // una request anónima.
      }
    }

    return super.getTracker(req);
  }
}
