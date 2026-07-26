import { Injectable } from '@nestjs/common';
import { ConversationStatus, ConversationResolution } from '@prisma/client';
import { PrismaService } from '../../shared/prisma/prisma.service';
import type { ExportRow } from './report-export.util';

const DEFAULT_PERIOD_DAYS = 30;
const HOUR_MS = 60 * 60 * 1000;

const RESOLUTION_LABELS: Record<string, string> = {
  RESOLVED: 'Resolvido',
  UNRESOLVED: 'Não resolvido',
  CANCELLED: 'Cancelado',
};

function formatDateTime(date: Date | null) {
  if (!date) return '—';
  return date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

function formatHours(hours: number | null) {
  if (hours === null) return '—';
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return `${h}h ${m}min`;
}

function avgResolutionHours(convs: { createdAt: Date; closedAt: Date | null }[]) {
  const closed = convs.filter((c) => c.closedAt);
  if (closed.length === 0) return null;
  const totalMs = closed.reduce((sum, c) => sum + (c.closedAt!.getTime() - c.createdAt.getTime()), 0);
  return totalMs / closed.length / HOUR_MS;
}

@Injectable()
export class ReportService {
  constructor(private readonly prisma: PrismaService) {}

  private resolvePeriod(from?: string, to?: string) {
    const to_ = to ? new Date(to) : new Date();
    const from_ = from ? new Date(from) : new Date(to_.getTime() - DEFAULT_PERIOD_DAYS * 24 * HOUR_MS);
    return { from: from_, to: to_ };
  }

  periodLabel(period: { from: Date; to: Date }) {
    const fmt = (d: Date) => d.toLocaleDateString('pt-BR');
    return `Período: ${fmt(period.from)} a ${fmt(period.to)}`;
  }

  // ── Base de atendimento (B-33) — lista detalhada de conversas do período ──
  async getAttendanceReport(companyId: string, from?: string, to?: string) {
    const period = this.resolvePeriod(from, to);

    const conversations = await this.prisma.conversation.findMany({
      where: { companyId, createdAt: { gte: period.from, lte: period.to } },
      select: {
        id: true,
        channel: true,
        status: true,
        resolution: true,
        createdAt: true,
        closedAt: true,
        contact: { select: { name: true, phone: true } },
        agent: { select: { name: true } },
        department: { select: { name: true } },
        tags: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const rows = conversations.map((c) => ({
      contato: c.contact?.name || c.contact?.phone || '—',
      canal: c.channel,
      atendente: c.agent?.name ?? '—',
      departamento: c.department?.name ?? '—',
      status: c.status,
      resolucao: c.resolution ? RESOLUTION_LABELS[c.resolution] : '—',
      tags: c.tags.map((t) => t.name).join(', ') || '—',
      criadaEm: c.createdAt,
      encerradaEm: c.closedAt,
    }));

    return { period, rows };
  }

  toAttendanceExportRows(
    rows: {
      contato: string;
      canal: string;
      atendente: string;
      departamento: string;
      status: string;
      resolucao: string;
      tags: string;
      criadaEm: Date;
      encerradaEm: Date | null;
    }[],
  ): ExportRow[] {
    return rows.map((r) => ({
      'Contato': r.contato,
      'Canal': r.canal,
      'Atendente': r.atendente,
      'Departamento': r.departamento,
      'Status': r.status,
      'Resolução': r.resolucao,
      'Tags': r.tags,
      'Criada em': formatDateTime(r.criadaEm),
      'Encerrada em': formatDateTime(r.encerradaEm),
    }));
  }

  // ── Por tipo de atendimento / tag (B-33) — volume + tempo médio por tag ──
  // Uma conversa com 2 tags entra na contagem das 2 — é o comportamento
  // esperado de um relatório "por categoria" com categorias não-exclusivas.
  async getByTagReport(companyId: string, from?: string, to?: string) {
    const period = this.resolvePeriod(from, to);
    const tags = await this.prisma.tag.findMany({
      where: { companyId },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });

    const rows = await Promise.all(
      tags.map(async (tag) => {
        const where = {
          companyId,
          tags: { some: { id: tag.id } },
          createdAt: { gte: period.from, lte: period.to },
        };

        const [total, resolvidas, naoResolvidas, canceladas, closedConvs] = await Promise.all([
          this.prisma.conversation.count({ where }),
          this.prisma.conversation.count({
            where: { ...where, status: ConversationStatus.CLOSED, resolution: ConversationResolution.RESOLVED },
          }),
          this.prisma.conversation.count({
            where: { ...where, status: ConversationStatus.CLOSED, resolution: ConversationResolution.UNRESOLVED },
          }),
          this.prisma.conversation.count({
            where: { ...where, status: ConversationStatus.CLOSED, resolution: ConversationResolution.CANCELLED },
          }),
          this.prisma.conversation.findMany({
            where: { ...where, status: ConversationStatus.CLOSED },
            select: { createdAt: true, closedAt: true },
          }),
        ]);

        return {
          tag: tag.name,
          total,
          resolvidas,
          naoResolvidas,
          canceladas,
          tempoMedioResolucaoHoras: avgResolutionHours(closedConvs),
        };
      }),
    );

    // Tag sem nenhuma conversa no período não aparece — linha zerada não
    // agrega nada ao relatório, só polui.
    return { period, rows: rows.filter((r) => r.total > 0) };
  }

  toByTagExportRows(
    rows: { tag: string; total: number; resolvidas: number; naoResolvidas: number; canceladas: number; tempoMedioResolucaoHoras: number | null }[],
  ): ExportRow[] {
    return rows.map((r) => ({
      'Tag': r.tag,
      'Total': String(r.total),
      'Resolvidas': String(r.resolvidas),
      'Não resolvidas': String(r.naoResolvidas),
      'Canceladas': String(r.canceladas),
      'Tempo médio de resolução': formatHours(r.tempoMedioResolucaoHoras),
    }));
  }

  // ── Por atendente (B-33) — desempenho de cada agente no período ──────────
  async getByAgentReport(companyId: string, from?: string, to?: string) {
    const period = this.resolvePeriod(from, to);
    const agents = await this.prisma.user.findMany({
      where: { companyId, isActive: true },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });

    const rows = await Promise.all(
      agents.map(async (agent) => {
        const periodWhere = { companyId, agentId: agent.id, createdAt: { gte: period.from, lte: period.to } };

        const [atendidas, resolvidas, naoResolvidas, canceladas, emAberto, closedConvs] = await Promise.all([
          this.prisma.conversation.count({ where: periodWhere }),
          this.prisma.conversation.count({
            where: { ...periodWhere, status: ConversationStatus.CLOSED, resolution: ConversationResolution.RESOLVED },
          }),
          this.prisma.conversation.count({
            where: { ...periodWhere, status: ConversationStatus.CLOSED, resolution: ConversationResolution.UNRESOLVED },
          }),
          this.prisma.conversation.count({
            where: { ...periodWhere, status: ConversationStatus.CLOSED, resolution: ConversationResolution.CANCELLED },
          }),
          // Em aberto é estado ATUAL, não do período — uma conversa aberta
          // há semanas continua relevante pro atendente hoje.
          this.prisma.conversation.count({
            where: { companyId, agentId: agent.id, status: ConversationStatus.OPEN },
          }),
          this.prisma.conversation.findMany({
            where: { ...periodWhere, status: ConversationStatus.CLOSED },
            select: { createdAt: true, closedAt: true },
          }),
        ]);

        return {
          atendente: agent.name,
          atendidas,
          resolvidas,
          naoResolvidas,
          canceladas,
          emAberto,
          tempoMedioResolucaoHoras: avgResolutionHours(closedConvs),
        };
      }),
    );

    // Atendente sem nenhuma atividade (nem no período, nem em aberto agora)
    // não aparece — mesmo raciocínio do relatório por tag.
    return { period, rows: rows.filter((r) => r.atendidas > 0 || r.emAberto > 0) };
  }

  toByAgentExportRows(
    rows: {
      atendente: string;
      atendidas: number;
      resolvidas: number;
      naoResolvidas: number;
      canceladas: number;
      emAberto: number;
      tempoMedioResolucaoHoras: number | null;
    }[],
  ): ExportRow[] {
    return rows.map((r) => ({
      'Atendente': r.atendente,
      'Atendidas': String(r.atendidas),
      'Resolvidas': String(r.resolvidas),
      'Não resolvidas': String(r.naoResolvidas),
      'Canceladas': String(r.canceladas),
      'Em aberto': String(r.emAberto),
      'Tempo médio de resolução': formatHours(r.tempoMedioResolucaoHoras),
    }));
  }
}
