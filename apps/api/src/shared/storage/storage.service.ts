import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as Minio from 'minio';
import { Readable } from 'stream';
import { randomUUID } from 'crypto';
import { extname } from 'path';

export interface UploadResult {
  url: string;
  bucket: string;
  key: string;
  size: number;
}

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private client: Minio.Client;
  private bucket: string;
  private publicUrl: string;

  constructor(private readonly config: ConfigService) {
    const endpoint = this.config.get<string>('MINIO_ENDPOINT', 'http://localhost:9000');
    const parsed = new URL(endpoint);

    const accessKey = this.config.get<string>('MINIO_ROOT_USER');
    const secretKey = this.config.get<string>('MINIO_ROOT_PASSWORD');

    // Validação crítica de credenciais
    const nodeEnv = this.config.get<string>('NODE_ENV', 'development');
    if (!accessKey || !secretKey) {
      if (nodeEnv === 'production' || nodeEnv === 'staging') {
        throw new Error(
          'MINIO_ROOT_USER e MINIO_ROOT_PASSWORD devem estar configurados em ' +
          nodeEnv,
        );
      }
      this.logger.warn(
        '⚠️  MinIO usando credenciais padrão (desenvolvimento apenas). ' +
        'Configure MINIO_ROOT_USER e MINIO_ROOT_PASSWORD em produção.',
      );
    }

    this.client = new Minio.Client({
      endPoint: parsed.hostname,
      port: Number(parsed.port) || (parsed.protocol === 'https:' ? 443 : 9000),
      useSSL: parsed.protocol === 'https:',
      accessKey: accessKey || 'minioadmin', // Padrão apenas para dev local
      secretKey: secretKey || 'minioadmin', // Padrão apenas para dev local
    });

    this.bucket = this.config.get<string>('MINIO_BUCKET', 'atendehub-media');
    this.publicUrl = endpoint; // URL base para acesso público às mídias
  }

  async onModuleInit() {
    try {
      const exists = await this.client.bucketExists(this.bucket);
      if (!exists) {
        await this.client.makeBucket(this.bucket);
        this.logger.log(`Bucket "${this.bucket}" criado.`);
      }

      // Leitura pública dos objetos: as URLs de mídia salvas nos Attachments
      // são acessadas diretamente pelo navegador (sem a policy → 403).
      // Em produção, trocar por URLs pré-assinadas ou proxy autenticado (F6).
      const publicReadPolicy = JSON.stringify({
        Version: '2012-10-17',
        Statement: [
          {
            Effect: 'Allow',
            Principal: { AWS: ['*'] },
            Action: ['s3:GetObject'],
            Resource: [`arn:aws:s3:::${this.bucket}/*`],
          },
        ],
      });
      await this.client.setBucketPolicy(this.bucket, publicReadPolicy);

      this.logger.log(`StorageService inicializado — bucket: ${this.bucket}`);
    } catch (err: any) {
      this.logger.error(
        `Falha ao verificar/criar bucket MinIO: ${err.message}`,
      );
      // Não lança exceção para permitir o boot mesmo sem MinIO (dev local)
    }
  }

  /**
   * Upload de um Buffer ou Stream para o MinIO.
   *
   * @param stream - Buffer ou Readable stream com os dados do arquivo
   * @param mimeType - Ex: "image/jpeg", "audio/ogg"
   * @param companyId - Isolamento por tenant
   * @param originalName - Nome original do arquivo (opcional)
   * @param size - Tamanho em bytes (obrigatório se stream, estimado se buffer)
   */
  async upload(
    stream: Buffer | Readable,
    mimeType: string,
    companyId: string,
    originalName?: string,
    size?: number,
  ): Promise<UploadResult> {
    const ext = originalName
      ? extname(originalName)
      : this.getExtensionFromMime(mimeType);

    const key = `${companyId}/${this.getFolder(mimeType)}/${randomUUID()}${ext}`;

    const dataSize = Buffer.isBuffer(stream) ? stream.length : size;

    const metaData = {
      'Content-Type': mimeType,
      ...(originalName && { 'X-Original-Name': originalName }),
    };

    await this.client.putObject(
      this.bucket,
      key,
      stream,
      dataSize,
      metaData,
    );

    const url = `${this.publicUrl}/${this.bucket}/${key}`;

    this.logger.debug(`Upload concluído: ${key} (${dataSize ?? '?'} bytes)`);

    return {
      url,
      bucket: this.bucket,
      key,
      size: dataSize ?? 0,
    };
  }

  /**
   * Gera uma URL presignada para download (uso em produção quando
   * o bucket não tem acesso anônimo).
   */
  async getPresignedUrl(key: string, expirySeconds = 3600): Promise<string> {
    return this.client.presignedGetObject(this.bucket, key, expirySeconds);
  }

  /**
   * Deleta um objeto do MinIO.
   */
  async delete(key: string): Promise<void> {
    await this.client.removeObject(this.bucket, key);
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  private getFolder(mimeType: string): string {
    if (mimeType.startsWith('image/')) return 'images';
    if (mimeType.startsWith('video/')) return 'videos';
    if (mimeType.startsWith('audio/')) return 'audios';
    return 'documents';
  }

  private getExtensionFromMime(mimeType: string): string {
    const map: Record<string, string> = {
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/webp': '.webp',
      'image/gif': '.gif',
      'video/mp4': '.mp4',
      'video/3gpp': '.3gp',
      'audio/ogg': '.ogg',
      'audio/mpeg': '.mp3',
      'audio/mp4': '.m4a',
      'application/pdf': '.pdf',
      'application/msword': '.doc',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
      'application/vnd.ms-excel': '.xls',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
    };
    return map[mimeType] || '';
  }
}
