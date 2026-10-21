import { createElement as h, useCallback, useEffect, useState } from 'react';
import { Icon } from './icons';
import { apiClient } from '../services/api';
import { wsClient } from '../services/websocket';
import { debounce } from '../utils/debounce';
import { formatElapsed } from '../utils/elapsed';
import { ROLE_LABELS } from '../utils/roles';
import { AVAILABILITY_LABELS } from './AvailabilityToggle';

// B-68 (parte 2): de quanto em quanto tempo o painel se atualiza sozinho, e
// quanto espera uma rajada de eventos acabar antes de buscar de novo (B-84)
export const MONITOR_REFRESH_MS = 30_000;
export const MONITOR_EVENT_DEBOUNCE_MS = 2_000;

// Eventos que mudam algum número do painel
const MONITOR_EVENTS = [
  'conversation.created',
  'conversation.updated',
  'conversation.assigned',
  'sla.breached',
  'sla.service_breached',
  'user.availability',
];

const timeOf = (iso) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

// Número que só chama atenção quando passa de zero (texto + cor, não só cor)
const alertCell = (value) =>
  h('td', { className: value > 0 ? 'monitor-number monitor-alert' : 'monitor-number' }, String(value));

// B-68 (parte 2 / ADR-0019): a visão do supervisor — setores × atendentes, no
// padrão das centrais de atendimento: atendentes por estado e, por setor,
// quantas esperam, a maior espera, quantas estão em atendimento e os SLAs
// estourados. Destaca o atendente Offline com paciente esperando resposta.
export function QueueMonitorView() {
  const [overview, setOverview] = useState(null);
  const [error, setError] = useState(null);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    try {
      const data = await apiClient.getConversationsOverview();
      setOverview(data);
      setError(null);
    } catch (err) {
      setError(err?.message || 'Não foi possível carregar o painel');
    } finally {
      setNow(Date.now());
    }
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(load, MONITOR_REFRESH_MS);
    const refetch = debounce(load, MONITOR_EVENT_DEBOUNCE_MS);
    const unsubscribers = MONITOR_EVENTS.map((event) => wsClient.on(event, refetch));
    return () => {
      clearInterval(timer);
      refetch.cancel();
      unsubscribers.forEach((off) => off?.());
    };
  }, [load]);

  const totals = overview?.totals;
  const departmentNames = Object.fromEntries((overview?.departments ?? []).map((d) => [d.id, d.name]));

  return h(
    'div',
    { className: 'monitor-view' },
    h(
      'div',
      { className: 'section-header' },
      h('h2', null, h(Icon, { name: 'eye', size: 16 }), ' Painel da fila'),
      h(
        'div',
        { className: 'monitor-header-actions' },
        overview && h('span', { className: 'monitor-updated' }, `Atualizado às ${timeOf(overview.generatedAt)}`),
        h('button', { type: 'button', className: 'settings-btn', onClick: load },
          h(Icon, { name: 'refresh', size: 14 }), ' Atualizar'),
      ),
    ),
    error && h('div', { className: 'settings-error monitor-error', role: 'alert' }, h(Icon, { name: 'warning', size: 15 }), ` ${error}`),
    !overview && !error && h('p', { className: 'dashboard-loading' }, 'Carregando o painel…'),

    totals && h(
      'div',
      { className: 'metrics', 'aria-label': 'Resumo da fila' },
      h('article', { className: 'metric-card' },
        h('span', null, 'Na fila'),
        h('strong', null, String(totals.waiting)),
        h('small', { className: 'monitor-card-note' },
          totals.oldestWaitingSince ? `maior espera: ${formatElapsed(totals.oldestWaitingSince, now)}` : 'ninguém esperando')),
      h('article', { className: `metric-card${totals.waitSlaBreached > 0 ? ' monitor-card-alert' : ''}` },
        h('span', null, 'SLA da espera estourado'),
        h('strong', null, String(totals.waitSlaBreached))),
      h('article', { className: 'metric-card' },
        h('span', null, 'Em atendimento'),
        h('strong', null, String(totals.inService))),
      h('article', { className: `metric-card${totals.serviceSlaBreached > 0 ? ' monitor-card-alert' : ''}` },
        h('span', null, 'SLA do atendimento estourado'),
        h('strong', null, String(totals.serviceSlaBreached))),
      h('article', { className: 'metric-card' },
        h('span', null, 'Atendentes Online'),
        h('strong', null, `${totals.agentsOnline} de ${totals.agentsTotal}`)),
    ),

    overview && h(
      'section',
      { className: 'monitor-section' },
      h('h3', null, 'Setores'),
      overview.departments.length === 0
        ? h('p', { className: 'settings-hint' }, 'Nenhum setor criado — crie em Configurações → Grupos (setores).')
        : h(
            'div',
            { className: 'monitor-table-wrap' },
            h(
              'table',
              { className: 'monitor-table' },
              h('caption', { className: 'sr-only' }, 'Setores: fila, atendimento e SLA'),
              h('thead', null, h('tr', null,
                h('th', { scope: 'col' }, 'Setor'),
                h('th', { scope: 'col' }, 'Na fila'),
                h('th', { scope: 'col' }, 'Maior espera'),
                h('th', { scope: 'col' }, 'Espera estourada'),
                h('th', { scope: 'col' }, 'Em atendimento'),
                h('th', { scope: 'col' }, 'Atendimento estourado'),
                h('th', { scope: 'col' }, 'Online'),
              )),
              h('tbody', null, overview.departments.map((dept) =>
                h('tr', { key: dept.id ?? 'sem-setor', className: dept.isActive === false ? 'monitor-row-muted' : undefined },
                  h('th', { scope: 'row' },
                    h('span', { className: 'settings-color-dot', style: { background: dept.color || '#94a3b8' } }),
                    ` ${dept.name}`,
                    dept.isActive === false && h('span', { className: 'settings-badge off monitor-inline-badge' }, 'Inativo')),
                  h('td', { className: 'monitor-number' }, String(dept.waiting)),
                  h('td', null, dept.oldestWaitingSince ? formatElapsed(dept.oldestWaitingSince, now) : '—'),
                  alertCell(dept.waitSlaBreached),
                  h('td', { className: 'monitor-number' }, String(dept.inService)),
                  alertCell(dept.serviceSlaBreached),
                  h('td', null, dept.id ? `${dept.agentsOnline} de ${dept.agentsTotal}` : '—'),
                ),
              )),
            ),
          ),
    ),

    overview && h(
      'section',
      { className: 'monitor-section' },
      h('h3', null, 'Atendentes'),
      h(
        'div',
        { className: 'monitor-table-wrap' },
        h(
          'table',
          { className: 'monitor-table' },
          h('caption', { className: 'sr-only' }, 'Atendentes: estado e atendimentos'),
          h('thead', null, h('tr', null,
            h('th', { scope: 'col' }, 'Atendente'),
            h('th', { scope: 'col' }, 'Estado'),
            h('th', { scope: 'col' }, 'Setores'),
            h('th', { scope: 'col' }, 'Em atendimento'),
            h('th', { scope: 'col' }, 'Atendimento estourado'),
            h('th', { scope: 'col' }, 'Aguardando resposta'),
          )),
          h('tbody', null, overview.agents.map((agent) => {
            const online = agent.availability === 'ONLINE';
            // Paciente esperando resposta de quem não está trabalhando
            const stranded = !online && agent.awaitingReply > 0;
            return h('tr', { key: agent.id, className: stranded ? 'monitor-row-warning' : undefined },
              h('th', { scope: 'row' },
                h('div', null, agent.name),
                h('small', { className: 'monitor-role' }, ROLE_LABELS[agent.role] ?? agent.role)),
              h('td', null,
                h('span', { className: `settings-badge ${online ? 'ok' : 'off'}` },
                  AVAILABILITY_LABELS[agent.availability] ?? agent.availability)),
              h('td', null,
                agent.departmentIds.length
                  ? agent.departmentIds.map((id) => departmentNames[id]).filter(Boolean).join(', ')
                  : '—'),
              h('td', { className: 'monitor-number' }, String(agent.inService)),
              alertCell(agent.serviceSlaBreached),
              h('td', { className: agent.awaitingReply > 0 ? 'monitor-number monitor-attention' : 'monitor-number' },
                String(agent.awaitingReply),
                stranded && h('span', { className: 'monitor-stranded' },
                  h(Icon, { name: 'warning', size: 12 }), ' Offline com paciente esperando')),
            );
          })),
        ),
      ),
    ),
  );
}
