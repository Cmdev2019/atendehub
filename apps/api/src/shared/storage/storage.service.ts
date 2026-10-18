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
  // C-07/B-59, revisto no B-64: a URL é assinada pelo próprio `client`, com
  // o host do storage (MINIO_ENDPOINT) — é ele quem confere a assinatura V4,
  // que inclui o host. Com MINIO_PUBLIC_ENDPOINT (produção:
  // https://media.<domínio>), só a origem da URL já assinada é trocada pela
  // do domínio de mídia, e o nginx repassa a requisição ao storage com o
  // Host original (bloco `media.` do nginx.conf). No Cloudflare R2 é o único
  // jeito: URL assinada não funciona com domínio próprio, só com
  // <conta>.r2.cloudflarestorage.com. Sem a variável (dev), a URL sai como
  // foi assinada.
  private publicOrigin?: string;
  // B-64: false quando o bucket vive num storage gerenciado (R2 em
  // produção), criado e mantido privado no painel do provedor.
  private manageBucket: boolean;
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

    // Região explícita: sem ela o SDK consulta a região do bucket pela rede
    // (GetBucketLocation) antes de assinar. No R2 a região é `auto`
    // (`us-east-1` também é aceita).
    const region = this.config.get<string>('MINIO_REGION', 'us-east-1');
    const credentials = {
      accessKey: accessKey || 'minioadmin', // Padrão apenas para dev local
      secretKey: secretKey || 'minioadmin', // Padrão apenas para dev local
    };

    this.client = new Minio.Client({
      endPoint: parsed.hostname,
      port: Number(parsed.port) || (parsed.protocol === 'https:' ? 443 : 9000),
      useSSL: parsed.protocol === 'https:',
      region,
      ...credentials,
    });

    const publicEndpoint = this.config.get<string>('MINIO_PUBLIC_ENDPOINT')?.trim();
    if (nodeEnv === 'production' && !publicEndpoint?.startsWith('https://')) {
      throw new Error(
        'MINIO_PUBLIC_ENDPOINT deve estar configurado com https:// em produção ' +
          '(ex.: https://media.atendehub.com) — sem ele, nenhuma mídia carrega no navegador (C-07).',
      );
    }
    this.publicOrigin = publicEndpoint ? new URL(publicEndpoint).origin : undefined;
    this.manageBucket = this.config.get<string>('MINIO_MANAGE_BUCKET', 'true') !== 'false';

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

      // B-64: no storage gerenciado a API só confere que o bucket existe. O
      // R2 nem implementa bucket policy (o bucket é privado enquanto não se
      // liga acesso público no painel), e o token da API só alcança objetos.
      if (!this.manageBucket) {
        if (!exists) {
          this.logger.error(
            `Bucket "${this.bucket}" não existe no storage — crie no painel do provedor (RUNBOOK, B-64).`,
          );
          return;
        }
        this.logger.log(
          `StorageService inicializado — bucket: ${this.bucket} (gerenciado pelo provedor; URLs assinadas por ${this.defaultExpirySeconds}s)`,
        );
        return;
      }

      if (!exists) {
        await this.client.makeBucket(this.bucket);
        this.logger.log(`Bucket "${this.bucket}" criado.`);
      }

      // B-38 (hardening pós-auditoria, achado ao vivo por E2E contra MinIO
      // real): a versão original do B-38 só PARAVA de aplicar a policy
      // pública em boots futuros — não revogava a policy pública que uma
      // versão anterior do código já tinha aplicado em boots passados.
      // Bucket policy é estado PERSISTENTE no MinIO, não efêmero: qualquer
      // ambiente (dev, staging ou produção) onde o código pré-B-38 rodou
      // pelo menos uma vez continuava com leitura pública ativa mesmo depois
      // do "fix" — provado ao vivo (GET anônimo devolvendo 200, policy
      // `{"Effect":"Allow","Principal":{"AWS":["*"]}}` ainda presente).
      // `setBucketPolicy(bucket, '')` limpa QUALQUER policy existente
      // (idempotente — nenhum efeito se já não houver nenhuma), a cada boot,
      // então a exposição legada não sobrevive ao próximo deploy em nenhum
      // ambiente, independente de quando ele rodou a última vez o código
      // antigo.
      await this.client.setBucketPolicy(this.bucket, '');

      this.logger.log(
        `StorageService inicializado — bucket: ${this.bucket} (privado; policy pública revogada se existisse; URLs assinadas por ${this.defaultExpirySeconds}s)`,
      );
    } catch (err: any) {
      this.logger.error(
        `Falha ao verificar/criar/proteger o bucket do storage: ${err.message}`,
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
    const signed = await this.client.presignedGetObject(
      this.bucket,
      key,
      expirySeconds ?? this.defaultExpirySeconds,
    );
    return this.toPublicUrl(signed);
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

  // Troca só esquema e host da URL assinada pelos do domínio de mídia,
  // preservando caminho e query byte a byte — sem decodificar nem
  // recodificar nada — porque é sobre eles (e sobre o Host que o nginx
  // repassa) que o storage confere a assinatura.
  private toPublicUrl(signedUrl: string): string {
    if (!this.publicOrigin) return signedUrl;
    const pathStart = signedUrl.indexOf('/', signedUrl.indexOf('://') + 3);
    return this.publicOrigin + signedUrl.slice(pathStart);
  }

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
