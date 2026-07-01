import 'dotenv/config';
import * as Sentry from '@sentry/nestjs';

/**
 * Sin SENTRY_DSN el SDK no envía nada (no-op) — así queda listo para activarse
 * solo con la variable de entorno, sin tocar código, cuando haya un proyecto Sentry real.
 */
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV ?? 'development',
  tracesSampleRate: 1.0,
});
