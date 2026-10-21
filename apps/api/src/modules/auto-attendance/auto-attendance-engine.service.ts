import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import {
  AutoAttendanceAction,
  ConversationResolution,
  ConversationStatus,
  MessageStatus,
  MessageType,
  SenderType,
} from '../../generated/prisma/client';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { EvolutionService } from '../whatsapp/evolution.service';
import { ConversationService } from '../conversation/conversation.service';
import { resolveTimeZone } from '../../shared/time/company-time';
import { isWithinBusinessHours } from '../../shared/time/business-hours';
import { EventsService } from '../events/events.service';
import { AutoAttendanceSessionService } from './auto-attendance-session.service';
import { QUEUE_NAMES } from '../../shared/queues/queue-names';
import { AutoAttendanceInactivityJobData } from './auto-attendance-inactivity.processor';
import {
  AUTO_ATTENDANCE_JOB_OPTIONS,
  AutoAttendanceJobData,
  autoAttendanceJobId,
} from './auto-attendance-jobs';
import { isUniqueConstraintViolation } from '../../shared/prisma/prisma-errors.util';

interface MenuOptionLike {
  id: string;
  order: number;
  label: string;
  action: AutoAttendanceAction;
  departmentId: string | null;
  queueId: string | null;
}

const FLOW_WITH_OPTIONS_SELECT = {
  id: true,
  isActive: true,
  greetingMessage: true,
  businessHours: true,
  outOfHoursMessage: true,
  inactivityTimeoutSecs: true,
  inactivityMessage: true,
  closingMessage: true,
  company: { select: { timezone: true } },
  menuOptions: {
    select: { id: true, order: true, label: true, action: true, departmentId: true, queueId: true },
    orderBy: { order: 'asc' as const },
  },
};

// Executa o fluxo configurado em AutoAttendanceService (saudação → menu →
// roteamento/inatividade) — separado do CRUD porque lida com efeitos
// colaterais reais (envia mensagem de verdade pelo WhatsApp), não só leitura/
// escrita de config.
@Injectable()
export class AutoAttendanceEngineService {
  private readonly logger = new Logger(AutoAttendanceEngineService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly evolutionService: EvolutionService,
    private readonly conversationService: ConversationService,
    private readonly eventsService: EventsService,
    private readonly sessionService: AutoAttendanceSessionService,
    @InjectQueue(QUEUE_NAMES.AUTO_ATTENDANCE_INACTIVITY)
    private readonly inactivityQueue: Queue<AutoAttendanceInactivityJobData>,
    @InjectQueue(QUEUE_NAMES.AUTO_ATTENDANCE)
    private readonly autoQueue: Queue<AutoAttendanceJobData>,
  ) {}

  // ── Enfileira a reação do robô a uma mensagem do cliente (B-78) ───────────
  // Chamado pelo webhook; quem executa é o AutoAttendanceProcessor. O id do
  // job é o da mensagem: um retry do webhook não duplica a reação.
  async enqueue(messageId: string, data: AutoAttendanceJobData): Promise<void> {
    await this.autoQueue.add(data, {
      ...AUTO_ATTENDANCE_JOB_OPTIONS,
      jobId: autoAttendanceJobId(messageId),
    });
  }

  // ── Qualquer mensagem do cliente com o menu aberto é atividade (B-78) ────
  // Antes, o prazo de inatividade contava só a partir do menu: mídia enviada
  // com o menu aberto ou uma resposta inválida não o renovavam, e a conversa
  // era encerrada "por inatividade" com o cliente ativo.
  async registerActivity(companyId: string, conversationId: string): Promise<void> {
    if (!(await this.sessionService.isAwaitingMenuReply(conversationId))) return;

    const flow = await this.prisma.autoAttendanceFlow.findUnique({
      where: { companyId },
      select: { inactivityTimeoutSecs: true },
    });
    if (flow?.inactivityTimeoutSecs) {
      await this.scheduleInactivityCheck(conversationId, companyId, flow.inactivityTimeoutSecs);
    }
  }

  private inactivityJobId(conversationId: string) {
    return `auto-attendance-inactivity:${conversationId}`;
  }

  private async scheduleInactivityCheck(conversationId: string, companyId: string, timeoutSecs: number) {
    await this.cancelInactivityCheck(conversationId);
    await this.inactivityQueue.add(
      { conversationId, companyId },
      { jobId: this.inactivityJobId(conversationId), delay: timeoutSecs * 1000 },
    );
  }

  private async cancelInactivityCheck(conversationId: string) {
    const job = await this.inactivityQueue.getJob(this.inactivityJobId(conversationId));
    if (!job) return;
    await job.remove().catch(() => undefined);
  }

  // ── Disparado ao nascer uma conversa nova (webhook.service.ts) ────────────
  async handleNewConversation(params: {
    companyId: string;
    conversationId: string;
    contactPhone: string;
    sessionName: string;
    queueGreetingMsg: string | null;
  }): Promise<void> {
    const { companyId, conversationId, contactPhone, sessionName, queueGreetingMsg } = params;

    try {
      const flow = await this.prisma.autoAttendanceFlow.findUnique({
        where: { companyId },
        select: FLOW_WITH_OPTIONS_SELECT,
      });
      if (!flow || !flow.isActive) return;

      const now = new Date();
      const timeZone = resolveTimeZone(flow.company?.timezone);
      if (!isWithinBusinessHours(flow.businessHours as any, now, timeZone)) {
        if (flow.outOfHoursMessage) {
          await this.sendBotMessage(conversationId, sessionName, contactPhone, companyId, flow.outOfHoursMessage);
        }
        return;
      }

      const greeting = queueGreetingMsg || flow.greetingMessage;
      if (greeting) {
        await this.sendBotMessage(conversationId, sessionName, contactPhone, companyId, greeting);
      }

      if (flow.menuOptions.length === 0) return;

      await this.sendBotMessage(
        conversationId,
        sessionName,
        contactPhone,
        companyId,
        this.buildMenuText(flow.menuOptions),
      );
      await this.sessionService.setAwaitingMenuReply(conversationId);

      if (flow.inactivityTimeoutSecs) {
        await this.scheduleInactivityCheck(conversationId, companyId, flow.inactivityTimeoutSecs);
      }
    } catch (err: any) {
      // Falha no auto-atendimento nunca pode derrubar o processamento da
      // mensagem em si — o contato entrou na fila normal (WAITING) mesmo sem
      // saudação/menu, um agente humano ainda dá conta do recado.
      this.logger.error(`Falha ao iniciar auto-atendimento (conversa ${conversationId}): ${err.message}`);
    }
  }

  // ── Disparado numa mensagem seguinte, se havia um menu aguardando resposta ─
  async handleReply(params: {
    companyId: string;
    conversationId: string;
    contactPhone: string;
    sessionName: string;
    text: string;
  }): Promise<boolean> {
    const { companyId, conversationId, contactPhone, sessionName, text } = params;

    const awaiting = await this.sessionService.isAwaitingMenuReply(conversationId);
    if (!awaiting) return false;

    try {
      const flow = await this.prisma.autoAttendanceFlow.findUnique({
        where: { companyId },
        select: FLOW_WITH_OPTIONS_SELECT,
      });
      if (!flow) {
        await this.sessionService.clear(conversationId);
        await this.cancelInactivityCheck(conversationId);
        return false;
      }

      const matched = this.matchOption(flow.menuOptions, text);
      if (!matched) {
        // Resposta inválida também é sinal de vida (B-78)
        if (flow.inactivityTimeoutSecs) {
          await this.scheduleInactivityCheck(conversationId, companyId, flow.inactivityTimeoutSecs);
        }
        await this.sendBotMessage(
          conversationId,
          sessionName,
          contactPhone,
          companyId,
          `Não entendi. Escolha uma das opções:\n${this.buildMenuText(flow.menuOptions)}`,
        );
        return true; // consumiu a mensagem — não repassa pro roteamento normal
      }

      await this.sessionService.clear(conversationId);
      await this.cancelInactivityCheck(conversationId);

      if (matched.action === AutoAttendanceAction.END_CONVERSATION) {
        if (flow.closingMessage) {
          await this.sendBotMessage(conversationId, sessionName, contactPhone, companyId, flow.closingMessage);
        }
        await this.conversationService.updateStatus(companyId, conversationId, {
          status: ConversationStatus.CLOSED,
          resolution: ConversationResolution.UNRESOLVED,
        } as any);
        return true;
      }

      await this.conversationService.routeAutoAttendance(companyId, conversationId, {
        departmentId: matched.departmentId ?? undefined,
        queueId: matched.queueId ?? undefined,
      });
      await this.sendBotMessage(
        conversationId,
        sessionName,
        contactPhone,
        companyId,
        `Encaminhando você para: ${matched.label}`,
      );
      return true;
    } catch (err: any) {
      this.logger.error(`Falha ao processar resposta de menu (conversa ${conversationId}): ${err.message}`);
      return true; // já estava aguardando menu — não deixa cair no fluxo normal mesmo com erro
    }
  }

  // ── Disparado pelo processor de inatividade (job atrasado) ────────────────
  async handleInactivityTimeout(conversationId: string, companyId: string): Promise<void> {
    const stillAwaiting = await this.sessionService.isAwaitingMenuReply(conversationId);
    if (!stillAwaiting) {
      this.logger.debug(`Conversa ${conversationId} já saiu do menu — nada a fazer`);
      return;
    }

    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: {
        status: true,
        agentId: true,
        whatsapp: { select: { sessionName: true } },
        contact: { select: { phone: true } },
      },
    });

    if (!conversation || conversation.status !== ConversationStatus.WAITING || conversation.agentId) {
      // Conversa já saiu do estado que o auto-atendimento controla (agente
      // assumiu manualmente, por exemplo) — não mexe mais nela.
      await this.sessionService.clear(conversationId);
      return;
    }

    const flow = await this.prisma.autoAttendanceFlow.findUnique({
      where: { companyId },
      select: { inactivityMessage: true, closingMessage: true },
    });

    const sessionName = conversation.whatsapp?.sessionName;
    const contactPhone = conversation.contact?.phone;

    if (sessionName && contactPhone) {
      if (flow?.inactivityMessage) {
        await this.sendBotMessage(conversationId, sessionName, contactPhone, companyId, flow.inactivityMessage);
      }
      if (flow?.closingMessage) {
        await this.sendBotMessage(conversationId, sessionName, contactPhone, companyId, flow.closingMessage);
      }
    }

    await this.conversationService.updateStatus(companyId, conversationId, {
      status: ConversationStatus.CLOSED,
      resolution: ConversationResolution.UNRESOLVED,
    } as any);

    await this.sessionService.clear(conversationId);
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private async sendBotMessage(
    conversationId: string,
    sessionName: string,
    contactPhone: string,
    companyId: string,
    text: string,
  ): Promise<void> {
    const result = await this.evolutionService.sendTextMessage(sessionName, contactPhone, text);
    const externalId: string | null = result?.key?.id ?? null;

    // B-78 (M-05): grava o externalId devolvido pela Evolution e a conexão —
    // sem eles, o eco da mensagem (MESSAGES_UPSERT fromMe) não casava com
    // esta linha e virava uma 2ª mensagem, como se fosse do atendente.
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { whatsappConnectionId: true },
    });
    const whatsappConnectionId = conversation?.whatsappConnectionId ?? null;

    const data = {
      conversationId,
      whatsappConnectionId,
      senderType: SenderType.BOT,
      content: text,
      type: MessageType.TEXT,
      status: MessageStatus.SENT,
      externalId,
    };
    let saved: { id: string; status: MessageStatus; sentAt: Date };
    try {
      saved = await this.prisma.message.create({ data });
    } catch (err) {
      // O eco chegou antes (outro worker): a linha já existe como fromMe —
      // passa a ser do robô e não refaz efeitos do webhook.
      if (!isUniqueConstraintViolation(err) || !externalId || !whatsappConnectionId) throw err;
      saved = await this.prisma.message.update({
        where: { whatsappConnectionId_externalId: { whatsappConnectionId, externalId } },
        data: { senderType: SenderType.BOT, pendingWebhookSteps: [] },
      });
    }

    // B-60/B-78: a resposta do robô não conta como não lida nem troca a
    // prévia da conversa — a lista continua mostrando o que o cliente disse.

    this.eventsService.emitNewMessage({
      companyId,
      conversationId,
      message: {
        id: saved.id,
        senderType: SenderType.BOT,
        content: text,
        type: MessageType.TEXT,
        status: saved.status,
        sentAt: saved.sentAt,
        externalId,
      },
    });
  }

  private buildMenuText(options: MenuOptionLike[]): string {
    return options.map((o) => `${o.order} - ${o.label}`).join('\n');
  }

  private matchOption(options: MenuOptionLike[], text: string): MenuOptionLike | null {
    const trimmed = text.trim();
    const asNumber = Number.parseInt(trimmed, 10);
    if (!Number.isNaN(asNumber)) {
      const byOrder = options.find((o) => o.order === asNumber);
      if (byOrder) return byOrder;
    }
    const lower = trimmed.toLowerCase();
    return options.find((o) => o.label.toLowerCase() === lower) ?? null;
  }
}
