import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CreateBucketCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const EXPIRACION_SUBIDA_SEGUNDOS = 5 * 60;
const EXPIRACION_DESCARGA_SEGUNDOS = 60 * 60;

@Injectable()
export class S3Service implements OnModuleInit {
  private readonly logger = new Logger(S3Service.name);
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly endpoint: string;

  constructor(private readonly config: ConfigService) {
    this.endpoint = this.config.getOrThrow<string>('S3_ENDPOINT');
    this.bucket = this.config.getOrThrow<string>('S3_BUCKET');
    this.client = new S3Client({
      region: this.config.get<string>('S3_REGION', 'us-east-1'),
      endpoint: this.endpoint,
      forcePathStyle:
        this.config.get<string>('S3_FORCE_PATH_STYLE', 'true') === 'true',
      credentials: {
        accessKeyId: this.config.getOrThrow<string>('S3_ACCESS_KEY'),
        secretAccessKey: this.config.getOrThrow<string>('S3_SECRET_KEY'),
      },
    });
  }

  /**
   * Crea el bucket (privado — sin política de acceso público, ver
   * urlDescarga()) si todavía no existe — idempotente, así que es seguro
   * correrlo en cada arranque. Necesario porque un MinIO recién desplegado
   * empieza sin buckets; en AWS S3 real el bucket normalmente ya se
   * aprovisiona aparte, así que esto no debería intentar crear nada ahí.
   */
  async onModuleInit(): Promise<void> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
      return;
    } catch {
      // No existe (o no se pudo confirmar) — se intenta crear a continuación.
    }

    try {
      await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
      this.logger.log(`Bucket "${this.bucket}" creado.`);
    } catch (err) {
      this.logger.warn(
        `No se pudo crear/verificar el bucket "${this.bucket}": ${String(err)}`,
      );
    }
  }

  /** URL prefirmada de subida (PUT), expiración corta, Content-Type acotado a imágenes. */
  async generarUrlSubida(
    s3Key: string,
    contentType = 'image/jpeg',
  ): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: s3Key,
      ContentType: contentType,
    });
    return getSignedUrl(this.client, command, {
      expiresIn: EXPIRACION_SUBIDA_SEGUNDOS,
    });
  }

  /** Bucket privado — cada foto se sirve con una URL de descarga (GET) prefirmada, nunca con acceso directo/público. */
  async urlDescarga(s3Key: string): Promise<string> {
    const command = new GetObjectCommand({ Bucket: this.bucket, Key: s3Key });
    return getSignedUrl(this.client, command, {
      expiresIn: EXPIRACION_DESCARGA_SEGUNDOS,
    });
  }

  /** Descarga los bytes de un objeto — usado para armar el ZIP de fotos en el servidor. */
  async descargarObjeto(s3Key: string): Promise<Buffer> {
    const command = new GetObjectCommand({ Bucket: this.bucket, Key: s3Key });
    const respuesta = await this.client.send(command);
    const bytes = await respuesta.Body!.transformToByteArray();
    return Buffer.from(bytes);
  }
}
