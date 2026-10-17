import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { StorageService, UploadResult } from '../../shared/storage/storage.service';

export interface MediaDownloadResult {
  url: string;        // URL no MinIO
  mimeType: string;
  size: number;
  fileName?: string;
}

/**
 * Serviço responsável por baixar mídias da Evolution API e armazená-las no MinIO.
 *
 * A mídia do WhatsApp chega criptografada no payload do webhook — a única
 * origem aceita é o getBase64FromMediaMessage da própria Evolution, que devolve
 * o arquivo decriptado. B-50: o antigo `downloadAndStore` (download direto da
 * URL vinda na mensagem, enviando a EVOLUTION_API_KEY no cabeçalho) foi
 * removido — a credencial só pode ir para o host configurado em
 * EVOLUTION_API_URL.
 */
@Injectable()
export class MediaDownloadService {
  private readonly logger = new Logger(MediaDownloadService.name);
  private readonly evolutionBaseUrl: string;
  private readonly evolutionApiKey: string;
  private readonly downloadTimeoutMs = 30_000; // 30s timeout

  constructor(
    private readonly config: ConfigService,
    private readonly storageService: StorageService,
  ) {
    this.evolutionBaseUrl = this.config.get<string>('EVOLUTION_API_URL', 'http://localhost:8080');
    this.evolutionApiKey = this.config.get<string>('EVOLUTION_API_KEY', '');
  }

  /**
   * Baixa mídia usando o endpoint getBase64FromMediaMessage da Evolution API
   * (devolve o arquivo já decriptado) e faz upload para o MinIO.
   *
   * @param sessionName - Nome da sessão na Evolution API
   * @param messageId - ID da mensagem no WhatsApp
   * @param mimeType - MIME type esperado
   * @param companyId - ID da empresa
   * @param fileName - Nome original do arquivo (opcional)
   */
  async downloadFromEvolution(
    sessionName: string,
    messageId: string,
    mimeType: string,
    companyId: string,
    fileName?: string,
  ): Promise<MediaDownloadResult | null> {
    try {
      this.logger.debug(
        `Baixando mídia via Evolution API: session=${sessionName}, msgId=${messageId}`,
      );

      const { data } = await axios.post(
        `${this.evolutionBaseUrl}/chat/getBase64FromMediaMessage/${sessionName}`,
        { message: { key: { id: messageId } } },
        {
          headers: {
            apikey: this.evolutionApiKey,
            'Content-Type': 'application/json',
          },
          timeout: this.downloadTimeoutMs,
        },
      );

      const base64 = data?.base64;
      const mediaMimeType = data?.mimetype || mimeType;

      if (!base64) {
        this.logger.warn(`Evolution API não retornou base64 para msgId=${messageId}`);
        return null;
      }

      // Remove prefixo "data:mime/type;base64," se presente
      const cleanBase64 = base64.includes(',') ? base64.split(',')[1] : base64;
      const buffer = Buffer.from(cleanBase64, 'base64');

      if (buffer.length === 0) {
        this.logger.warn('Base64 decodificou para buffer vazio');
        return null;
      }

      const result: UploadResult = await this.storageService.upload(
        buffer,
        mediaMimeType,
        companyId,
        fileName,
        buffer.length,
      );

      this.logger.debug(
        `Mídia armazenada via Evolution: ${result.key} (${buffer.length} bytes)`,
      );

      return {
        url: result.url,
        mimeType: mediaMimeType,
        size: buffer.length,
        fileName,
      };
    } catch (err: any) {
      this.logger.error(
        `Falha ao baixar mídia da Evolution API: ${err.message}`,
        err.stack,
      );
      return null;
    }
  }
}
