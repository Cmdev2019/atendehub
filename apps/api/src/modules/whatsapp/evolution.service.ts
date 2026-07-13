import {
  Injectable,
  Logger,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';

// ─── Tipos de resposta da Evolution API ───────────────────────────────────────
export interface EvolutionInstance {
  instanceName: string;
  instanceId?: string;
  status?: string;
  apikey?: string;
  profileName?: string;
  profilePictureUrl?: string;
  phoneNumber?: string;
}

export interface EvolutionQrCode {
  base64?: string;
  code?: string;
}

export interface EvolutionConnectionState {
  instance: {
    instanceName: string;
    state: 'open' | 'close' | 'connecting';
  };
}

export interface EvolutionSendMessage {
  key: { id: string };
  status: string;
}

@Injectable()
export class EvolutionService {
  private readonly logger = new Logger(EvolutionService.name);
  private readonly http: AxiosInstance;

  constructor(private readonly config: ConfigService) {
    const baseURL = this.config.get<string>('EVOLUTION_API_URL', 'http://localhost:8080');
    const apiKey = this.config.get<string>('EVOLUTION_API_KEY', '');

    this.http = axios.create({
      baseURL,
      headers: {
        apikey: apiKey,
        'Content-Type': 'application/json',
      },
      timeout: 15000,
    });

    // Log de todas as requisições em desenvolvimento
    this.http.interceptors.request.use((config) => {
      this.logger.debug(`${config.method?.toUpperCase()} ${config.url}`);
      return config;
    });

    this.http.interceptors.response.use(
      (res) => res,
      (err) => {
        const status = err.response?.status;
        const message = err.response?.data?.message ?? err.message;
        this.logger.error(`Evolution API error ${status}: ${message}`);
        throw err;
      },
    );
  }

  // ── Criar instância (sessão) ───────────────────────────────────────────────
  async createInstance(sessionName: string, webhookUrl: string): Promise<EvolutionInstance> {
    try {
      const { data } = await this.http.post('/instance/create', {
        instanceName: sessionName,
        qrcode: true,
        integration: 'WHATSAPP-BAILEYS',
        webhook: {
          url: webhookUrl,
          byEvents: true,
          base64: true,
          events: [
            'QRCODE_UPDATED',
            'CONNECTION_UPDATE',
            'MESSAGES_UPSERT',
            'MESSAGES_UPDATE',
            'MESSAGES_DELETE',
            'SEND_MESSAGE',
            'CONTACTS_UPSERT',
          ],
        },
      });

      return data?.instance ?? data;
    } catch (err: any) {
      throw new InternalServerErrorException(
        `Falha ao criar instância na Evolution API: ${err.response?.data?.message ?? err.message}`,
      );
    }
  }

  // ── Buscar QR Code ─────────────────────────────────────────────────────────
  async getQrCode(sessionName: string): Promise<EvolutionQrCode> {
    try {
      const { data } = await this.http.get(`/instance/connect/${sessionName}`);
      return data;
    } catch (err: any) {
      if (err.response?.status === 404) {
        throw new NotFoundException(`Instância ${sessionName} não encontrada na Evolution API`);
      }
      throw new InternalServerErrorException(
        `Falha ao buscar QR Code: ${err.response?.data?.message ?? err.message}`,
      );
    }
  }

  // ── Estado da conexão ──────────────────────────────────────────────────────
  async getConnectionState(sessionName: string): Promise<EvolutionConnectionState> {
    try {
      const { data } = await this.http.get(`/instance/connectionState/${sessionName}`);
      return data;
    } catch (err: any) {
      throw new InternalServerErrorException(
        `Falha ao verificar estado da conexão: ${err.response?.data?.message ?? err.message}`,
      );
    }
  }

  // ── Buscar dados da instância (após conectar) ──────────────────────────────
  async fetchInstance(sessionName: string): Promise<EvolutionInstance | null> {
    try {
      const { data } = await this.http.get(`/instance/fetchInstances?instanceName=${sessionName}`);
      // A API retorna um array
      const list = Array.isArray(data) ? data : [data];
      return list.find((i: any) => i.instance?.instanceName === sessionName)?.instance ?? null;
    } catch {
      return null;
    }
  }

  // ── Desconectar instância ──────────────────────────────────────────────────
  async disconnectInstance(sessionName: string): Promise<void> {
    try {
      await this.http.delete(`/instance/logout/${sessionName}`);
    } catch (err: any) {
      this.logger.warn(`Falha ao desconectar ${sessionName}: ${err.message}`);
    }
  }

  // ── Deletar instância ──────────────────────────────────────────────────────
  async deleteInstance(sessionName: string): Promise<void> {
    try {
      await this.http.delete(`/instance/delete/${sessionName}`);
    } catch (err: any) {
      this.logger.warn(`Falha ao deletar instância ${sessionName}: ${err.message}`);
    }
  }

  // ── Enviar mensagem de texto ───────────────────────────────────────────────
  async sendTextMessage(
    sessionName: string,
    to: string,
    text: string,
  ): Promise<EvolutionSendMessage> {
    try {
      const { data } = await this.http.post(`/message/sendText/${sessionName}`, {
        number: to,
        text,
      });
      return data;
    } catch (err: any) {
      throw new InternalServerErrorException(
        `Falha ao enviar mensagem: ${err.response?.data?.message ?? err.message}`,
      );
    }
  }

  // ── Enviar mídia (imagem, vídeo, documento) ────────────────────────────────
  async sendMediaMessage(
    sessionName: string,
    to: string,
    mediaUrl: string,
    mediaType: 'image' | 'video' | 'document' | 'audio',
    caption?: string,
    fileName?: string,
  ): Promise<EvolutionSendMessage> {
    try {
      const { data } = await this.http.post(`/message/sendMedia/${sessionName}`, {
        number: to,
        mediatype: mediaType,
        media: mediaUrl,
        caption,
        fileName,
      });
      return data;
    } catch (err: any) {
      throw new InternalServerErrorException(
        `Falha ao enviar mídia: ${err.response?.data?.message ?? err.message}`,
      );
    }
  }

  // ── Marcar mensagem como lida ──────────────────────────────────────────────
  async markAsRead(sessionName: string, remoteJid: string, messageId: string): Promise<void> {
    try {
      await this.http.post(`/chat/markMessageAsRead/${sessionName}`, {
        readMessages: [{ remoteJid, id: messageId, fromMe: false }],
      });
    } catch (err: any) {
      this.logger.warn(`Falha ao marcar como lido: ${err.message}`);
    }
  }

  // ── Verificar se número existe no WhatsApp ─────────────────────────────────
  async checkNumber(sessionName: string, phone: string): Promise<boolean> {
    try {
      const { data } = await this.http.post(`/chat/whatsappNumbers/${sessionName}`, {
        numbers: [phone],
      });
      const result = Array.isArray(data) ? data[0] : data;
      return result?.exists ?? false;
    } catch {
      return false;
    }
  }
}
