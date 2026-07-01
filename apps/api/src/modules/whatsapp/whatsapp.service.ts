import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { ConnectionStatus } from '@prisma/client';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { EvolutionService } from './evolution.service';
import { CreateConnectionDto } from './dto/create-connection.dto';
import { UpdateConnectionDto } from './dto/update-connection.dto';

@Injectable()
export class WhatsappService {
  private readonly logger = new Logger(WhatsappService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly evolution: EvolutionService,
  ) {}

  // ── Listar conexões da empresa ────────────────────────────────────────────
  async findAll(companyId: string) {
    return this.prisma.whatsAppConnection.findMany({
      where: { companyId },
      select: {
        id: true,
        name: true,
        phone: true,
        profileName: true,
        profilePicture: true,
        status: true,
        platform: true,
        isActive: true,
        lastSeenAt: true,
        createdAt: true,
        department: { select: { id: true, name: true, color: true } },
        _count: { select: { conversations: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ── Buscar conexão por ID ─────────────────────────────────────────────────
  async findOne(companyId: string, id: string) {
    const conn = await this.prisma.whatsAppConnection.findFirst({
      where: { id, companyId },
      select: {
        id: true,
        name: true,
        sessionName: true,
        phone: true,
        profileName: true,
        profilePicture: true,
        status: true,
        platform: true,
        battery: true,
        isActive: true,
        lastSeenAt: true,
        createdAt: true,
        updatedAt: true,
        department: { select: { id: true, name: true, color: true } },
      },
    });

    if (!conn) throw new NotFoundException('Conexão não encontrada');
    return conn;
  }

  // ── Criar conexão e instância na Evolution API ────────────────────────────
  async create(companyId: string, dto: CreateConnectionDto) {
    // Verifica limite do plano
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: {
        maxChannels: true,
        slug: true,
        _count: { select: { whatsappConnections: { where: { isActive: true } } } },
      },
    });

    if (company && company._count.whatsappConnections >= company.maxChannels) {
      throw new BadRequestException(
        `Limite de ${company.maxChannels} conexões WhatsApp atingido para o plano atual`,
      );
    }

    // Gera nome único para a sessão na Evolution: slug-nome-timestamp
    const slug = company?.slug ?? companyId.slice(0, 8);
    const safeName = dto.name.toLowerCase().replace(/[^a-z0-9]/g, '-');
    const sessionName = `${slug}-${safeName}-${Date.now()}`;

    // Verifica se já existe sessão com esse nome
    const existing = await this.prisma.whatsAppConnection.findUnique({
      where: { sessionName },
    });
    if (existing) throw new ConflictException('Já existe uma conexão com esse nome');

    // URL do webhook que a Evolution vai chamar
    const webhookUrl =
      process.env.EVOLUTION_WEBHOOK_URL ??
      'http://host.docker.internal:3001/api/v1/webhooks/evolution';

    // Cria instância na Evolution API
    const instance = await this.evolution.createInstance(sessionName, webhookUrl);

    this.logger.log(`Instância criada na Evolution: ${sessionName}`);

    // Salva no banco
    return this.prisma.whatsAppConnection.create({
      data: {
        companyId,
        departmentId: dto.departmentId,
        name: dto.name,
        sessionName,
        status: ConnectionStatus.QR_CODE,
        apiToken: instance.apikey,
      },
      select: {
        id: true,
        name: true,
        sessionName: true,
        status: true,
        createdAt: true,
      },
    });
  }

  // ── Gerar / atualizar QR Code ─────────────────────────────────────────────
  async getQrCode(companyId: string, id: string) {
    const conn = await this.findOne(companyId, id);

    if (conn.status === ConnectionStatus.CONNECTED) {
      throw new BadRequestException('Esta conexão já está conectada');
    }

    const qr = await this.evolution.getQrCode(conn.sessionName);

    // Salva QR temporariamente no banco (para exibir no front via polling)
    if (qr.base64) {
      await this.prisma.whatsAppConnection.update({
        where: { id },
        data: { qrCode: qr.base64, status: ConnectionStatus.QR_CODE },
      });
    }

    return { qrCode: qr.base64, code: qr.code };
  }

  // ── Verificar estado da conexão na Evolution ──────────────────────────────
  async syncStatus(companyId: string, id: string) {
    const conn = await this.findOne(companyId, id);
    const state = await this.evolution.getConnectionState(conn.sessionName);
    const evolutionState = state?.instance?.state;

    const statusMap: Record<string, ConnectionStatus> = {
      open: ConnectionStatus.CONNECTED,
      close: ConnectionStatus.DISCONNECTED,
      connecting: ConnectionStatus.CONNECTING,
    };

    const newStatus = statusMap[evolutionState] ?? ConnectionStatus.DISCONNECTED;

    // Se conectou, busca dados do perfil
    let profileData = {};
    if (newStatus === ConnectionStatus.CONNECTED) {
      const instance = await this.evolution.fetchInstance(conn.sessionName);
      if (instance) {
        profileData = {
          phone: instance.phoneNumber,
          profileName: instance.profileName,
          profilePicture: instance.profilePictureUrl,
          qrCode: null, // limpa o QR após conexão
          lastSeenAt: new Date(),
        };
      }
    }

    const updated = await this.prisma.whatsAppConnection.update({
      where: { id },
      data: { status: newStatus, ...profileData },
      select: {
        id: true,
        name: true,
        phone: true,
        profileName: true,
        status: true,
        lastSeenAt: true,
      },
    });

    return updated;
  }

  // ── Desconectar ───────────────────────────────────────────────────────────
  async disconnect(companyId: string, id: string) {
    const conn = await this.findOne(companyId, id);
    await this.evolution.disconnectInstance(conn.sessionName);

    return this.prisma.whatsAppConnection.update({
      where: { id },
      data: { status: ConnectionStatus.DISCONNECTED, phone: null, lastSeenAt: new Date() },
      select: { id: true, name: true, status: true },
    });
  }

  // ── Atualizar dados da conexão ────────────────────────────────────────────
  async update(companyId: string, id: string, dto: UpdateConnectionDto) {
    await this.findOne(companyId, id);

    return this.prisma.whatsAppConnection.update({
      where: { id },
      data: dto,
      select: {
        id: true,
        name: true,
        isActive: true,
        updatedAt: true,
        department: { select: { id: true, name: true } },
      },
    });
  }

  // ── Remover conexão ───────────────────────────────────────────────────────
  async remove(companyId: string, id: string) {
    const conn = await this.findOne(companyId, id);

    // Deleta a instância na Evolution API
    await this.evolution.deleteInstance(conn.sessionName);

    await this.prisma.whatsAppConnection.delete({ where: { id } });
    return { message: `Conexão "${conn.name}" removida com sucesso` };
  }

  // ── Atualizar status via webhook (chamado pelo WebhookModule) ─────────────
  async handleConnectionUpdate(
    sessionName: string,
    state: string,
    phone?: string,
    profileName?: string,
    profilePicture?: string,
  ) {
    const conn = await this.prisma.whatsAppConnection.findUnique({
      where: { sessionName },
    });

    if (!conn) {
      this.logger.warn(`Webhook: sessão desconhecida ${sessionName}`);
      return;
    }

    const statusMap: Record<string, ConnectionStatus> = {
      open: ConnectionStatus.CONNECTED,
      close: ConnectionStatus.DISCONNECTED,
      connecting: ConnectionStatus.CONNECTING,
    };

    const status = statusMap[state] ?? ConnectionStatus.DISCONNECTED;

    await this.prisma.whatsAppConnection.update({
      where: { id: conn.id },
      data: {
        status,
        ...(phone && { phone }),
        ...(profileName && { profileName }),
        ...(profilePicture && { profilePicture }),
        ...(state === 'open' && { qrCode: null, lastSeenAt: new Date() }),
      },
    });

    this.logger.log(`Conexão ${sessionName} → ${status}`);
  }

  // ── Atualizar QR Code via webhook ─────────────────────────────────────────
  async handleQrCodeUpdate(sessionName: string, qrCode: string) {
    await this.prisma.whatsAppConnection.updateMany({
      where: { sessionName },
      data: { qrCode, status: ConnectionStatus.QR_CODE },
    });
  }
}
