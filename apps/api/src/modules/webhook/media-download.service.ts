import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { Readable } from 'stream';
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
 * A Evolution API v2 retorna URLs temporárias de mídia no payload do webhook.
 * Essas URLs expiram, então precisamos baixar e persistir no nosso storage.
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
   * Baixa mídia a partir de uma URL (pode ser URL da Evolution ou URL direta)
   * e faz upload para o MinIO.
   *
   * @param mediaUrl - URL de download da mídia
   * @param mimeType - MIME type do arquivo
   * @param companyId - ID da empresa (isolamento por tenant)
   * @param fileName - Nome original do arquivo (opcional)
   */
  async downloadAndStore(
    mediaUrl: string,
    mimeType: string,
    companyId: string,
    fileName?: string,
  ): Promise<MediaDownloadResult | null> {
    try {
      this.logger.debug(`Baixando mídia: ${mediaUrl}`);

      const response = await axios.get(mediaUrl, {
        responseType: 'arraybuffer',
        timeout: this.downloadTimeoutMs,
        headers: {
          apikey: this.evolutionApiKey,
        },
        // Não seguir redirects infinitos
        maxRedirects: 3,
        // Limite de 50MB para evitar abuso
        maxContentLength: 50 * 1024 * 1024,
      });

      const buffer = Buffer.from(response.data);

      if (buffer.length === 0) {
        this.logger.warn('Download retornou conteúdo vazio');
        return null;
      }

      // Usa o Content-Type da resposta se o mimeType fornecido for genérico
      const contentType = response.headers['content-type'];
      const actualMimeType =
        (typeof contentType === 'string' ? contentType.split(';')[0]?.trim() : null) || mimeType;

      const result: UploadResult = await this.storageService.upload(
        buffer,
        actualMimeType,
        companyId,
        fileName,
        buffer.length,
      );

      this.logger.debug(
        `Mídia armazenada: ${result.key} (${buffer.length} bytes)`,
      );

      return {
        url: result.url,
        mimeType: actualMimeType,
        size: buffer.length,
        fileName,
      };
    } catch (err: any) {
      this.logger.error(
        `Falha ao baixar/armazenar mídia: ${err.message}`,
        err.stack,
      );
      return null;
    }
  }

  /**
   * Baixa mídia usando o endpoint getBase64FromMediaMessage da Evolution API.
   * Útil quando o payload não contém uma URL direta de download.
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
