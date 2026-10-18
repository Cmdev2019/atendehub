import { Inject, Injectable, Logger } from '@nestjs/common';
import { Redis } from 'ioredis';
import { REDIS_CLIENT } from '../../shared/redis/redis.module';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { MessageType, MessageStatus, Prisma, SenderType } from '@prisma/client';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { ContactService } from '../contact/contact.service';
import { ConversationService } from '../conversation/conversation.service';
import { buildMessagePreview } from '../conversation/message-preview';
import { MessageService } from '../message/message.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { EvolutionService } from '../whatsapp/evolution.service';
import { EventsService } from '../events/events.service';
import {
  MEDIA_DOWNLOAD_JOB_OPTIONS,
  MediaDownloadJobData,
  mediaDownloadJobId,
} from './media-download.processor';
import { WEBHOOK_STEP, WebhookStep, planWebhookSteps } from './webhook-steps';
import { classifyMessage, isNonContactJid } from './whatsapp-message';
import { QUEUE_NAMES } from '../../shared/queues/queue-names';
import { AutoAttendanceEngineService } from '../auto-attendance/auto-attendance-engine.service';
import { extractPhoneFromJid, isOpaqueLidJid } from '../../shared/whatsapp/jid.util';

// messageTimestamp da Evolution vem em segundos (número ou texto). Valor
// ausente, inválido ou no futuro (relógio torto) cai no horário do servidor.
export function whatsappTimestampToDate(raw: unknown): Date | undefined {
  const seconds = Number(raw);
  if (!Number.isFinite(seconds) || seconds <= 0) return undefined;
  const date = new Date(seconds * 1000);
  return date.getTime() > Date.now() + 60_000 ? undefined : date;
}

// ─── Tipos dos payloads da Evolution API v2 ───────────────────────────────────
interface EvolutionMessageKey {
  remoteJid: string;   // ex: "5511999999999@s.whatsapp.net"
  fromMe: boolean;
  id: string;          // ID da mensagem no WhatsApp
}

interface EvolutionMessage {
  key: EvolutionMessageKey;
  pushName?: string;         // nome do contato
  message?: Record<string, any>; // conteúdo cru — classificado em whatsapp-message.ts (B-81)
  messageType?: string;
  messageTimestamp?: number;
  status?: string;
}

interface EvolutionWebhookPayload {
  event: string;
  instance: string;          // sessionName
  data: any;
}

@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);

  // Throttle da busca de foto de perfil: no máximo 1 tentativa por contato
  // a cada 6h (contatos sem foto/privacidade sempre retornam null — sem o
  // throttle seria 1 chamada à Evolution por mensagem recebida). B-80: chave
  // no Redis com TTL — antes era um Map do processo que nunca era limpo
  // (crescia a cada contato) e, com várias réplicas, valia por réplica.
  private static readonly AVATAR_RETRY_MS = 6 * 60 * 60 * 1000;
  private static readonly AVATAR_KEY_PREFIX = 'avatar:fetched:';

  constructor(
    private readonly prisma: PrismaService,
    private readonly contactService: ContactService,
    private readonly conversationService: ConversationService,
    private readonly messageService: MessageService,
    private readonly whatsappService: WhatsappService,
    private readonly evolutionService: EvolutionService,
    private readonly eventsService: EventsService,
    private readonly autoAttendanceEngine: AutoAttendanceEngineService,
    @InjectQueue(QUEUE_NAMES.MEDIA_DOWNLOAD)
    private readonly mediaQueue: Queue<MediaDownloadJobData>,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  // ── Entry point — roteia pelo tipo de evento ──────────────────────────────
  async handleEvent(payload: EvolutionWebhookPayload): Promise<void> {
    const { event, instance, data } = payload;

    this.logger.log(`Webhook recebido: ${event} | instância: ${instance}`);

    try {
      switch (event) {
        case 'MESSAGES_UPSERT':
          await this.handleMessagesUpsert(instance, data);
          break;

        case 'MESSAGES_UPDATE':
          await this.handleMessagesUpdate(instance, data);
          break;

        case 'MESSAGES_DELETE':
          await this.handleMessagesDelete(instance, data);
          break;

        case 'CONNECTION_UPDATE':
          await this.handleConnectionUpdate(instance, data);
          break;

        case 'QRCODE_UPDATED':
          await this.handleQrCodeUpdate(instance, data);
          break;

        case 'CONTACTS_UPSERT':
          await this.handleContactsUpsert(instance, data);
          break;

        default:
          this.logger.debug(`Evento ignorado: ${event}`);
      }
    } catch (err: any) {
      // B-39: antes o erro morria aqui (só logger.error, sem relançar) — o
      // WebhookProcessor nunca via a exceção, o Bull marcava o job como
      // concluído com sucesso e nenhum retry disparava. Loga o contexto (o
      // processor já loga de novo com tentativa/classificação/elapsedTime,
      // mas isso aqui é o único lugar que sabe qual `event` específico
      // estava sendo tratado) e PROPAGA — é o processor que decide o que
      // fazer com o erro (retry, discard, DLQ).
      this.logger.error(`Erro ao processar evento ${event}: ${err.message}`, err.stack);
      throw err;
    }
  }

  // ── MESSAGES_UPSERT — nova mensagem recebida ou enviada ───────────────────
  private async handleMessagesUpsert(sessionName: string, data: any): Promise<void> {
    const messages: EvolutionMessage[] = Array.isArray(data) ? data : [data];

    for (const msg of messages) {
      await this.processMessage(sessionName, msg);
    }
  }

  private async processMessage(sessionName: string, msg: EvolutionMessage): Promise<void> {
    const { key, pushName, message, messageTimestamp } = msg;

    if (!key?.remoteJid) return;

    // Ignora o que não é conversa com um contato: grupos, status (stories),
    // listas de transmissão e canais (B-81 — antes só grupo era filtrado)
    if (isNonContactJid(key.remoteJid)) {
      this.logger.debug(`Mensagem fora de conversa com contato ignorada: ${key.remoteJid}`);
      return;
    }

    // Extrai identificador limpo do JID: "5511999999999:12@s.whatsapp.net" →
    // "5511999999999" (":NN" é id de dispositivo e não faz parte do número —
    // sem removê-lo, o mesmo contato vira registros duplicados). Genérico por
    // domínio (@s.whatsapp.net, @c.us, @lid...) em vez de enumerar cada um —
    // o WhatsApp introduziu @lid (identificador de privacidade, quando o
    // remetente esconde o número) sem que essa lista fosse atualizada; o JID
    // passava direto sem normalizar. Nota: para @lid o valor NÃO é um número
    // discável de verdade, é um id opaco do WhatsApp — ainda assim serve como
    // chave estável para não duplicar o contato entre mensagens do mesmo remetente.
    const phone = this.extractPhoneFromJid(key.remoteJid);

    // Busca a conexão pelo sessionName para obter o companyId
    const connection = await this.prisma.whatsAppConnection.findUnique({
      where: { sessionName },
      select: { id: true, companyId: true, departmentId: true },
    });

    if (!connection) {
      this.logger.warn(`Conexão não encontrada para sessão: ${sessionName}`);
      return;
    }

    const { companyId, id: whatsappConnectionId, departmentId } = connection;

    // B-81 (M-02): classifica ANTES de criar contato/conversa — reação,
    // edição e mensagens de controle não são mensagem nova. Antes, uma reação
    // numa conversa encerrada abria conversa nova, com saudação e menu.
    const classified = classifyMessage(message);
    if (classified.kind === 'ignore') {
      this.logger.debug(`Mensagem ${key.id} ignorada (${classified.reason})`);
      return;
    }
    if (classified.kind === 'reaction') {
      await this.applyReaction(companyId, whatsappConnectionId, classified.targetId, classified.text, key.fromMe);
      return;
    }
    if (classified.kind === 'edit') {
      await this.applyEdit(companyId, whatsappConnectionId, classified.targetId, classified.content);
      return;
    }

    // Upsert do contato. pushName é o nome de quem ENVIOU a mensagem:
    // em mensagens fromMe ele é o dono da conexão, não o contato —
    // nesse caso não atualiza o nome (senão todo contato vira o dono)
    const contact = await this.contactService.upsertFromWebhook(
      companyId,
      phone,
      key.fromMe ? undefined : pushName,
    );

    // Contato bloqueado — ignora
    if (contact.isBlocked) {
      this.logger.debug(`Mensagem de contato bloqueado: ${phone}`);
      return;
    }

    // Foto de perfil: busca na Evolution quando o contato ainda não tem
    // (fire-and-forget — não atrasa o processamento da mensagem)
    if (!contact.avatarUrl) {
      this.maybeFetchAvatar(sessionName, phone, contact.id).catch((err) => {
        this.logger.debug(`Falha ao buscar avatar de ${phone}: ${err.message}`);
      });
    }

    // Upsert da conversa — `isNew` explícito (B-35), sem depender de heurística
    // de timestamp (frágil sob latência e usada por baixo pra saber se dispara
    // o auto-atendimento, que só pode rodar numa conversa que acabou de nascer)
    const { conversation, isNew: isNewConversation, queue } =
      await this.conversationService.upsertFromWebhook(
        companyId,
        contact.id,
        whatsappConnectionId,
        undefined,
        departmentId,
        key.fromMe, // B-98: conversa aberta pela empresa não tem SLA
      );

    // Tipo e conteúdo, já desembrulhados (B-81)
    const { type, content, mimeType, fileName } = classified;

    // Determina se é mensagem do agente (fromMe) ou do cliente
    const senderType = key.fromMe ? SenderType.AGENT : SenderType.CLIENT;

    // B-76 (M-01): o que esta mensagem dispara é decidido aqui, uma vez, e
    // gravado junto com ela (ver webhook-steps.ts).
    const plannedSteps = planWebhookSteps({
      hasMedia: this.isMediaType(type),
      fromMe: key.fromMe,
      isNewConversation,
      isTextReply: type === MessageType.TEXT && !!content,
    });

    // Persiste a mensagem com dedup por externalId
    const savedMessage = await this.messageService.createFromWebhook({
      conversationId: conversation.id,
      whatsappConnectionId,
      content,
      type,
      senderType,
      externalId: key.id,
      metadata: {
        timestamp: messageTimestamp,
        remoteJid: key.remoteJid,
      },
      // B-79 (M-06): hora real da mensagem no WhatsApp, não a do
      // processamento — com webhooks em paralelo e retries com backoff, uma
      // mensagem pode ser gravada depois de outra mais nova e a conversa,
      // ordenada por sentAt, ficaria fora de ordem.
      sentAt: whatsappTimestampToDate(messageTimestamp),
      pendingWebhookSteps: plannedSteps,
    });

    // ── Idempotência (B-39, B-76) ────────────────────────────────────────────
    // `createFromWebhook` dedupe por externalId, mas isso só evita duplicar a
    // MENSAGEM. Num retry do Bull, refazer tudo que vem depois duplicaria
    // eventos e — o mais sério — o auto-atendimento (saudação reenviada,
    // resposta de menu dada duas vezes). Antes o retry pulava tudo e o que
    // tinha falhado ficava sem acontecer (B-76); agora cada etapa sai da lista
    // de pendências ao terminar e o retry roda só o que sobrou. O eco de uma
    // mensagem enviada pelo painel ou pelo bot já existe com a lista vazia.
    const pending = savedMessage.isNew ? plannedSteps : savedMessage.pendingWebhookSteps;
    if (pending.length === 0) {
      this.logger.debug(`Mensagem ${key.id} já tinha sido processada — nada pendente`);
      return;
    }
    if (!savedMessage.isNew) {
      this.logger.log(`Mensagem ${key.id}: retomando etapas pendentes (${pending.join(', ')})`);
    }

    const step = async (name: WebhookStep, run: () => Promise<unknown>) => {
      if (!pending.includes(name)) return;
      await run();
      await this.messageService.completeWebhookStep(savedMessage.id, name);
    };

    // ── Download de mídia (fila própria com retry, B-76) ────────────────────
    // O id do job é o da mensagem: enfileirar de novo num retry não duplica.
    await step(WEBHOOK_STEP.MEDIA, () =>
      this.mediaQueue.add(
        {
          messageId: savedMessage.id,
          conversationId: conversation.id,
          companyId,
          sessionName,
          externalMessageId: key.id,
          mimeType: mimeType ?? 'application/octet-stream',
          fileName,
        },
        { ...MEDIA_DOWNLOAD_JOB_OPTIONS, jobId: mediaDownloadJobId(savedMessage.id) },
      ),
    );

    // Prévia, horário e não lidas (B-42/B-60). Antes só rodava para texto do
    // cliente: áudio ou imagem sem legenda (content vazio) não subia a
    // conversa na lista nem marcava como não lida, e mensagem enviada pelo
    // próprio celular (fromMe) não mudava a prévia. Agora toda mensagem nova
    // atualiza; só a do cliente conta como não lida. O eco de mensagem
    // enviada pelo painel nem chega aqui (isNew=false acima) — quem atualiza
    // a prévia nesse caso é o SendMessageService.
    await step(WEBHOOK_STEP.PREVIEW, () =>
      this.conversationService.updateLastMessage(
        conversation.id,
        buildMessagePreview(type, content),
        { countAsUnread: !key.fromMe },
      ),
    );

    // ── Auto-atendimento (B-35) ─────────────────────────────────────────────
    // Nunca reage a mensagens fromMe (o próprio negócio respondendo pelo
    // celular) — só a mensagens de verdade do cliente (ver planWebhookSteps).
    // B-78: só enfileira; o robô envia na fila própria, fora deste worker.
    const autoJob = { companyId, conversationId: conversation.id, contactPhone: contact.phone, sessionName };
    await step(WEBHOOK_STEP.AUTO_GREETING, async () =>
      this.autoAttendanceEngine.enqueue(savedMessage.id, {
        ...autoJob,
        kind: 'greeting',
        // No retry a conversa já existe e o upsert não devolve a fila — a
        // saudação da fila vem do queueId gravado nela.
        queueGreetingMsg:
          queue?.greetingMsg ?? (await this.queueGreetingOf(conversation.queueId)),
      }),
    );
    // Só texto conta como resposta de menu — mídia/figurinha etc. enquanto o
    // menu está aberto não é tratada como seleção inválida, mas renova o
    // prazo de inatividade (AUTO_ACTIVITY)
    await step(WEBHOOK_STEP.AUTO_REPLY, () =>
      this.autoAttendanceEngine.enqueue(savedMessage.id, { ...autoJob, kind: 'reply', text: content }),
    );
    await step(WEBHOOK_STEP.AUTO_ACTIVITY, () =>
      this.autoAttendanceEngine.enqueue(savedMessage.id, { ...autoJob, kind: 'activity' }),
    );

    // ── Emite evento em tempo real ─────────────────────────────────────────
    await step(WEBHOOK_STEP.EVENT_CONVERSATION_CREATED, () =>
      this.eventsService.emitConversationCreated({
        companyId,
        conversation: {
          id: conversation.id,
          status: conversation.status,
          channel: conversation.channel,
          contact: {
            id: contact.id,
            name: contact.name,
            phone: contact.phone,
            avatarUrl: contact.avatarUrl,
          },
          whatsappConnectionId,
          createdAt: conversation.createdAt,
        },
      }),
    );

    await step(WEBHOOK_STEP.EVENT_MESSAGE_NEW, async () =>
      this.eventsService.emitNewMessage({
        companyId,
        conversationId: conversation.id,
        message: {
          id: savedMessage.id,
          senderType,
          content,
          type,
          status: savedMessage.status,
          sentAt: savedMessage.sentAt,
          externalId: key.id,
        },
      }),
    );

    this.logger.debug(`Mensagem processada: ${key.id} | ${phone} | ${type}`);
  }

  // ── MESSAGES_UPDATE — atualização de status (entregue, lido, etc.) ────────
  // C-09/B-58: tudo restrito à conexão (sessionName) de onde veio o evento —
  // o mesmo externalId existe nas duas pontas quando dois números cadastrados
  // conversam entre si, possivelmente de empresas diferentes.
  private async handleMessagesUpdate(sessionName: string, data: any): Promise<void> {
    const updates = Array.isArray(data) ? data : [data];
    const connectionId = await this.findConnectionId(sessionName);
    if (!connectionId) return;

    for (const update of updates) {
      const externalId = update.key?.id;
      const status = update.update?.status;

      if (!externalId || !status) continue;

      const statusMap: Record<string, MessageStatus> = {
        DELIVERY_ACK: MessageStatus.DELIVERED,
        READ: MessageStatus.READ,
        PLAYED: MessageStatus.READ,
      };

      const mappedStatus = statusMap[status];
      if (mappedStatus) {
        await this.messageService.updateStatus(connectionId, externalId, mappedStatus);

        // Busca a mensagem para obter conversationId e companyId
        const msg = await this.prisma.message.findFirst({
          where: { whatsappConnectionId: connectionId, externalId },
          select: {
            conversation: { select: { id: true, companyId: true } },
          },
        });

        if (msg?.conversation) {
          this.eventsService.emitMessageStatus({
            conversationId: msg.conversation.id,
            companyId: msg.conversation.companyId,
            externalId,
            status: mappedStatus,
          });
        }

        this.logger.debug(`Status atualizado: ${externalId} → ${mappedStatus}`);
      }
    }
  }

  // ── MESSAGES_DELETE — mensagem deletada no WhatsApp ───────────────────────
  // C-09/B-58: restrito à conexão do evento — ver handleMessagesUpdate.
  private async handleMessagesDelete(sessionName: string, data: any): Promise<void> {
    const keys = Array.isArray(data?.keys) ? data.keys : [data?.key].filter(Boolean);
    const connectionId = await this.findConnectionId(sessionName);
    if (!connectionId) return;

    for (const key of keys) {
      if (!key?.id) continue;
      await this.prisma.message.updateMany({
        where: { whatsappConnectionId: connectionId, externalId: key.id },
        data: { isDeleted: true, content: null, type: MessageType.DELETED },
      });
      this.logger.debug(`Mensagem deletada: ${key.id}`);
    }
  }

  private async findConnectionId(sessionName: string): Promise<string | null> {
    const connection = await this.prisma.whatsAppConnection.findUnique({
      where: { sessionName },
      select: { id: true },
    });
    if (!connection) {
      this.logger.warn(`Conexão não encontrada para sessão: ${sessionName}`);
      return null;
    }
    return connection.id;
  }

  // ── CONNECTION_UPDATE — mudança de estado da conexão ─────────────────────
  private async handleConnectionUpdate(sessionName: string, data: any): Promise<void> {
    const state = data?.state ?? data?.connection;
    // Evolution v2 envia o número do dono em "wuid" ("5512...@s.whatsapp.net",
    // às vezes com sufixo de dispositivo ":12"); os demais campos são legado v1.
    const rawJid = data?.wuid ?? data?.phoneNumber ?? data?.me?.id;
    const phone = extractPhoneFromJid(rawJid) || undefined;
    const profileName = data?.profileName ?? data?.me?.name;
    const profilePicture = data?.profilePictureUrl ?? undefined;

    await this.whatsappService.handleConnectionUpdate(
      sessionName,
      state,
      phone,
      profileName,
      profilePicture,
    );

    // Emite evento em tempo real para a empresa
    const conn = await this.prisma.whatsAppConnection.findUnique({
      where: { sessionName },
      select: { id: true, companyId: true, status: true },
    });

    if (conn) {
      this.eventsService.emitConnectionStatus({
        companyId: conn.companyId,
        connectionId: conn.id,
        sessionName,
        status: conn.status,
        phone,
        profileName,
      });
    }
  }

  // ── QRCODE_UPDATED — novo QR Code gerado ─────────────────────────────────
  private async handleQrCodeUpdate(sessionName: string, data: any): Promise<void> {
    const qrCode = data?.qrcode?.base64 ?? data?.base64 ?? data?.qrcode;

    if (qrCode) {
      await this.whatsappService.handleQrCodeUpdate(sessionName, qrCode);
      this.logger.debug(`QR Code atualizado: ${sessionName}`);
    }
  }

  // ── CONTACTS_UPSERT — atualização de contatos ─────────────────────────────
  private async handleContactsUpsert(sessionName: string, data: any): Promise<void> {
    const contacts = Array.isArray(data) ? data : [data];

    const connection = await this.prisma.whatsAppConnection.findUnique({
      where: { sessionName },
      select: { companyId: true },
    });

    if (!connection) return;

    for (const c of contacts) {
      const phone = this.extractPhoneFromJid(c.id);
      const name = c.pushName ?? c.verifiedName ?? c.name;

      if (!phone || !name) continue;

      await this.contactService.upsertFromWebhook(
        connection.companyId,
        phone,
        name,
        c.profilePictureUrl,
      );
    }
  }

  // ── Reação a uma mensagem existente (B-81) ────────────────────────────────
  // Fica na mensagem original (metadata.reaction); texto vazio = reação
  // removida. Mensagem de origem desconhecida (anterior ao AtendeHub): ignora.
  private async applyReaction(
    companyId: string,
    whatsappConnectionId: string,
    targetExternalId: string,
    text: string,
    fromMe: boolean,
  ): Promise<void> {
    const target = await this.prisma.message.findUnique({
      where: { whatsappConnectionId_externalId: { whatsappConnectionId, externalId: targetExternalId } },
      select: { id: true, conversationId: true, metadata: true },
    });
    if (!target) {
      this.logger.debug(`Reação a mensagem desconhecida (${targetExternalId}) ignorada`);
      return;
    }

    const { reaction: _old, ...metadata } = (target.metadata ?? {}) as Prisma.JsonObject;
    await this.prisma.message.update({
      where: { id: target.id },
      data: { metadata: text ? { ...metadata, reaction: { text, fromMe } } : metadata },
    });
    await this.eventsService.emitMessageUpdated({
      companyId,
      conversationId: target.conversationId,
      messageId: target.id,
      reaction: text || null,
    });
  }

  // ── Edição de uma mensagem existente (B-81) ───────────────────────────────
  private async applyEdit(
    companyId: string,
    whatsappConnectionId: string,
    targetExternalId: string,
    content: string,
  ): Promise<void> {
    const target = await this.prisma.message.findUnique({
      where: { whatsappConnectionId_externalId: { whatsappConnectionId, externalId: targetExternalId } },
      select: { id: true, conversationId: true },
    });
    if (!target) {
      this.logger.debug(`Edição de mensagem desconhecida (${targetExternalId}) ignorada`);
      return;
    }

    await this.prisma.message.update({
      where: { id: target.id },
      data: { content, isEdited: true },
    });
    await this.eventsService.emitMessageUpdated({
      companyId,
      conversationId: target.conversationId,
      messageId: target.id,
      content,
      isEdited: true,
    });
  }

  // ── Extrai o identificador (número ou id opaco) de um JID do WhatsApp ─────
  // Lógica pura em shared/whatsapp/jid.util.ts (reaproveitada também pelo
  // EvolutionService e pelo WebhookProcessor) — aqui só soma o log de aviso
  // específico deste contexto (processamento de mensagem recebida).
  private extractPhoneFromJid(jid?: string | null): string {
    if (isOpaqueLidJid(jid)) {
      this.logger.warn(
        `JID @lid recebido (número real oculto pelo WhatsApp): ${jid} — usando id opaco como chave do contato`,
      );
    }
    return extractPhoneFromJid(jid);
  }

  // ── Verifica se o tipo de mensagem contém mídia para download ─────────────
  private isMediaType(type: MessageType): boolean {
    const mediaTypes: MessageType[] = [
      MessageType.IMAGE,
      MessageType.VIDEO,
      MessageType.AUDIO,
      MessageType.DOCUMENT,
      MessageType.STICKER,
    ];
    return mediaTypes.includes(type);
  }

  // Saudação da fila da conversa (B-76) — usada quando o retry retoma a
  // saudação e o upsert, com a conversa já existente, não devolve a fila.
  private async queueGreetingOf(queueId: string | null | undefined): Promise<string | null> {
    if (!queueId) return null;
    const queue = await this.prisma.queue.findUnique({
      where: { id: queueId },
      select: { greetingMsg: true },
    });
    return queue?.greetingMsg ?? null;
  }

  // ── Busca a foto de perfil do contato na Evolution (com throttle) ─────────
  private async maybeFetchAvatar(
    sessionName: string,
    phone: string,
    contactId: string,
  ): Promise<void> {
    // SET NX com expiração: só quem cria a chave busca — atômico entre
    // réplicas. Redis fora do ar → não busca (melhor sem foto que inundar a
    // Evolution com uma chamada por mensagem).
    const acquired = await this.redis
      .set(WebhookService.AVATAR_KEY_PREFIX + contactId, '1', 'PX', WebhookService.AVATAR_RETRY_MS, 'NX')
      .catch(() => null);
    if (acquired !== 'OK') return;

    const url = await this.evolutionService.fetchProfilePictureUrl(sessionName, phone);
    if (!url) return;

    await this.prisma.contact.update({
      where: { id: contactId },
      data: { avatarUrl: url },
    });
    this.logger.debug(`Avatar atualizado para contato ${phone}`);
  }
}
