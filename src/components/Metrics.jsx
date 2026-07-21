import { createElement as h } from 'react';

// Indicadores calculados a partir das conversas carregadas (mesma lista da
// fila) — sem dado fictício. "Resolvidas hoje" e "Satisfação" exigiriam um
// endpoint agregado que o backend ainda não tem (ver B-2 no roadmap).
function computeMetrics(conversations) {
  const list = conversations || [];
  const waiting = list.filter((c) => c.status === 'WAITING').length;
  const open = list.filter((c) => c.status === 'OPEN').length;
  const unread = list.reduce((sum, c) => sum + (c.unreadCount || 0), 0);

  return [
    { label: 'Conversas na fila', value: String(list.length), note: `${waiting} aguardando` },
    { label: 'Em atendimento', value: String(open), note: 'status: OPEN' },
    { label: 'Aguardando resposta', value: String(waiting), note: 'status: WAITING' },
    { label: 'Mensagens não lidas', value: String(unread), note: `em ${list.filter((c) => c.unreadCount > 0).length} conversas` },
  ];
}

export function Metrics({ conversations }) {
  const metrics = computeMetrics(conversations);

  return h(
    'section',
    { className: 'metrics', 'aria-label': 'Indicadores rápidos' },
    metrics.map(({ label, value, note }) =>
      h(
        'article',
        { key: label, className: 'metric-card' },
        h('span', null, label),
        h('strong', null, value),
        h('small', null, note),
      ),
    ),
  );
}
