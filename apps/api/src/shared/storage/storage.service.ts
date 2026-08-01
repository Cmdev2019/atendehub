import { BadRequestException, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as Minio from 'minio';
import { Readable } from 'stream';
import { randomUUID } from 'crypto';

export interface UploadResult {
  url: string;
  bucket: string;
  key: string;
  size: number;
}

// ── Assinaturas de magic bytes para imagens (B-38) ──────────────────────────
// Cross-check contra Content-Type declarado: um upload marcado como
// `image/*` cujo conteúdo não bate com nenhuma assinatura conhecida é
// rejeitado (defesa contra MIME spoofing — ex.: HTML/SVG com script
// disfarçado de foto para XSS armazenado). Escopo limitado a imagens
// (formato mais previsível e vetor mais comum); vídeo/áudio/documento ficam
// só na allowlist de MIME — ver pendência no relatório de B-38.
const IMAGE_SIGNATURES: Array<(b: Buffer) => boolean> = [
  (b) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff, // JPEG
  (b) => b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), // PNG
  (b) => b.length >= 6 && b.subarray(0, 3).toString('ascii') === 'GIF', // GIF87a/GIF89a
  (b) =>
    b.length >= 12 &&
    b.subarray(0, 4).toString('ascii') === 'RIFF' &&
    b.subarray(8, 12).toString('ascii') === 'WEBP', // WEBP
];

// ── Allowlist de MIME → extensão ────────────────────────────────────────────
// Também funciona como allowlist de upload: tipo fora deste mapa é
// rejeitado (defesa contra upload arbitrário/extensão inválida). A extensão
// do arquivo salvo vem SEMPRE daqui, nunca do nome original enviado pelo
// cliente — corta de raiz qualquer tentativa de directory traversal ou
// injeção via nome de arquivo na key do objeto.
const MIME_EXTENSION_MAP: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'video/mp4': '.mp4',
  'video/3gpp': '.3gp',
  'video/quicktime': '.mov',
  'audio/ogg': '.ogg',
  'audio/mpeg': '.mp3',
  'audio/mp4': '.m4a',
  'audio/aac': '.aac',
  'audio/amr': '.amr',
  'audio/wav': '.wav',
  'application/pdf': '.pdf',
  'application/msword': '.doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'application/vnd.ms-excel': '.xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
  'application/zip': '.zip',
  'text/plain': '.txt',
  'text/csv': '.csv',
};

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private client: Minio.Client;
  private bucket: string;
  // Endpoint interno usado só para compor/decompor a identidade do objeto
  // (`${internalEndpoint}/${bucket}/${key}`, formato mantido por
  // compatibilidade com URLs já gravadas em `Attachment.url`/`User.avatarUrl`
  // antes do B-38). NUNCA é devolvido a um cliente sem antes virar presigned
  // URL — ver presignUrl/presignDeep.
  private internalEndpoint: string;
  private readonly defaultExpirySeconds: number;

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
    this.internalEndpoint = endpoint.replace(/\/+$/, '');

    // Tempo de vida da URL assinada (B-38). Curto o bastante para reduzir
    // janela de exposição se a URL vazar (log, print, encaminhamento), longo
    // o bastante para a mídia carregar no painel sem re-solicitar.
    const configuredExpiry = Number(
      this.config.get<string>('MEDIA_SIGNED_URL_EXPIRATION', '600'),
    );
    this.defaultExpirySeconds =
      Number.isFinite(configuredExpiry) && configuredExpiry > 0 ? configuredExpiry : 600;
  }

  async onModuleInit() {
    try {
      const exists = await this.client.bucketExists(this.bucket);
      if (!exists) {
        await this.client.makeBucket(this.bucket);
        this.logger.log(`Bucket "${this.bucket}" criado.`);
      }

      // B-38: nenhuma bucket policy é aplicada — bucket permanece PRIVADO
      // (comportamento padrão do MinIO/S3 na ausência de policy). Mídia só é
      // acessível via URL assinada (presignUrl/presignDeep), nunca por leitura
      // pública anônima.
      this.logger.log(
        `StorageService inicializado — bucket: ${this.bucket} (privado; URLs assinadas por ${this.defaultExpirySeconds}s)`,
      );
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
   * @param originalName - Nome original do arquivo (opcional, só vira metadado)
   * @param size - Tamanho em bytes (obrigatório se stream, estimado se buffer)
   */
  async upload(
    stream: Buffer | Readable,
    mimeType: string,
    companyId: string,
    originalName?: string,
    size?: number,
  ): Promise<UploadResult> {
    const normalizedMime = (mimeType || '').split(';')[0].trim().toLowerCase();
    const ext = MIME_EXTENSION_MAP[normalizedMime];

    if (!ext) {
      throw new BadRequestException(
        `Tipo de arquivo não permitido: ${mimeType || '(vazio)'}`,
      );
    }

    if (Buffer.isBuffer(stream)) {
      this.assertContentMatchesMime(stream, normalizedMime);
    }

    // Key sempre gerada pelo servidor (companyId autenticado + UUID + extensão
    // derivada do MIME validado) — o nome original do arquivo NUNCA entra na
    // key, eliminando directory traversal via nome de arquivo malicioso.
    const key = `${companyId}/${this.getFolder(normalizedMime)}/${randomUUID()}${ext}`;

    const dataSize = Buffer.isBuffer(stream) ? stream.length : size;

    const metaData = {
      'Content-Type': normalizedMime,
      ...(originalName && { 'X-Original-Name': this.sanitizeMetadataValue(originalName) }),
    };

    await this.client.putObject(
      this.bucket,
      key,
      stream,
      dataSize,
      metaData,
    );

    const url = `${this.buildPrefix()}${key}`;

    this.logger.debug(`Upload concluído: ${key} (${dataSize ?? '?'} bytes)`);

    return {
      url,
      bucket: this.bucket,
      key,
      size: dataSize ?? 0,
    };
  }

  /**
   * Gera uma URL presignada para download (único jeito de servir mídia desde
   * o B-38 — o bucket é privado).
   */
  async getPresignedUrl(key: string, expirySeconds?: number): Promise<string> {
    return this.client.presignedGetObject(
      this.bucket,
      key,
      expirySeconds ?? this.defaultExpirySeconds,
    );
  }

  /**
   * Troca uma URL "interna" (formato `${internalEndpoint}/${bucket}/${key}`,
   * como gravada em `Attachment.url`/`User.avatarUrl`) por uma URL assinada
   * de curta duração. URLs que não pertencem ao nosso bucket (ex.: foto de
   * perfil do WhatsApp servida pela própria Evolution/Meta, ou uma mídia
   * encaminhada por link externo) passam direto, sem modificação.
   */
  async presignUrl(
    url: string | null | undefined,
    expirySeconds?: number,
  ): Promise<string | null | undefined> {
    if (!url || !this.isInternalUrl(url)) return url;

    try {
      const key = this.extractKey(url);
      return await this.getPresignedUrl(key, expirySeconds);
    } catch (err: any) {
      this.logger.error(`Falha ao gerar URL assinada para ${url}: ${err.message}`);
      // Nunca cai de volta pra URL interna (ficaria 403 do lado do cliente de
      // qualquer forma, já que o bucket é privado) — null é o sinal explícito
      // de "mídia indisponível agora" para quem consome a resposta.
      return null;
    }
  }

  /**
   * Percorre recursivamente uma estrutura (objeto de resposta HTTP, payload
   * de evento Socket.IO) trocando toda string que seja uma URL interna do
   * MinIO por uma URL assinada. Usado pelo `MediaPresignInterceptor` (HTTP)
   * e por `EventsService` (WebSocket) — ponto único de saída de mídia da API.
   */
  async presignDeep<T = unknown>(value: T, expirySeconds?: number): Promise<T> {
    if (typeof value === 'string') {
      return (await this.presignUrl(value, expirySeconds)) as unknown as T;
    }

    if (!value || typeof value !== 'object' || Buffer.isBuffer(value) || value instanceof Date) {
      return value;
    }

    if (Array.isArray(value)) {
      return (await Promise.all(
        value.map((item) => this.presignDeep(item, expirySeconds)),
      )) as unknown as T;
    }

    const entries = await Promise.all(
      Object.entries(value as Record<string, unknown>).map(
        async ([k, v]) => [k, await this.presignDeep(v, expirySeconds)] as const,
      ),
    );
    return Object.fromEntries(entries) as T;
  }

  /**
   * Deleta um objeto do MinIO.
   */
  async delete(key: string): Promise<void> {
    await this.client.removeObject(this.bucket, key);
  }

  /**
   * Deleta um objeto a partir da URL interna salva em `Attachment.url`
   * (formato `${internalEndpoint}/${bucket}/${key}`, ver `upload()`). Usado
   * pra purgar mídia de um contato anonimizado (B-29/LGPD) — a tabela só
   * guarda a URL completa, não a key isolada.
   */
  async deleteByUrl(url: string): Promise<void> {
    await this.delete(this.extractKey(url));
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  private buildPrefix(): string {
    return `${this.internalEndpoint}/${this.bucket}/`;
  }

  private isInternalUrl(url: string): boolean {
    return typeof url === 'string' && url.startsWith(this.buildPrefix());
  }

  private extractKey(url: string): string {
    const prefix = this.buildPrefix();
    if (!url.startsWith(prefix)) {
      throw new Error(`URL fora do bucket esperado (${this.bucket}): ${url}`);
    }
    return url.slice(prefix.length);
  }

  // Cross-check de magic bytes contra o MIME declarado — só para imagens,
  // ver comentário de IMAGE_SIGNATURES no topo do arquivo.
  private assertContentMatchesMime(buffer: Buffer, mimeType: string): void {
    if (!mimeType.startsWith('image/')) return;

    const matches = IMAGE_SIGNATURES.some((test) => test(buffer));
    if (!matches) {
      throw new BadRequestException(
        'Conteúdo do arquivo não corresponde ao tipo declarado (possível falsificação de MIME type)',
      );
    }
  }

  // Remove quebras de linha e limita tamanho antes de gravar como metadado
  // do objeto (cabeçalho HTTP do lado do MinIO) — evita header/CRLF injection
  // via nome de arquivo malicioso.
  private sanitizeMetadataValue(value: string): string {
    return value.replace(/[\r\n]+/g, ' ').slice(0, 255);
  }

  private getFolder(mimeType: string): string {
    if (mimeType.startsWith('image/')) return 'images';
    if (mimeType.startsWith('video/')) return 'videos';
    if (mimeType.startsWith('audio/')) return 'audios';
    return 'documents';
  }
}
