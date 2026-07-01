import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const EXPIRACION_SEGUNDOS = 5 * 60;

@Injectable()
export class S3Service {
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
      expiresIn: EXPIRACION_SEGUNDOS,
    });
  }

  /** El bucket tiene política de lectura pública (galería), así que la URL directa sirve para mostrar la foto. */
  urlPublica(s3Key: string): string {
    return `${this.endpoint}/${this.bucket}/${s3Key}`;
  }
}
