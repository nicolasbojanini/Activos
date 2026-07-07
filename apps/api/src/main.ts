import './instrument';

import { json, urlencoded } from 'express';
import compression from 'compression';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

// El body-parser por defecto de Express (100kb) alcanza para requests
// normales, pero el commit de una importación manda las filas del Excel
// completas como JSON — un cliente de 100.000 activos puede pesar varios MB.
// Se desactiva el parser automático de Nest para poder subir el límite acá.
const LIMITE_BODY = '50mb';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  // gzip: la descarga de sesión móvil (miles de fichas de activos como JSON)
  // pasa de varios MB a ~10-15% de su tamaño por la red del celular.
  app.use(compression());
  app.use(json({ limit: LIMITE_BODY }));
  app.use(urlencoded({ extended: true, limit: LIMITE_BODY }));
  app.setGlobalPrefix('api/v1');
  app.enableCors();

  const config = new DocumentBuilder()
    .setTitle('ADN · Auditoría de activos fijos')
    .setDescription(
      'API REST para la auditoría física de activos fijos (ADN — gestión y orden)',
    )
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
