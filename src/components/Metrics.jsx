import { createElement as h } from 'react';

// Indicadores vêm do endpoint agregado GET /conversations/stats (B-2) —
// contagens reais da empresa inteira, independentes da paginação da fila
// (ver useConversations.js#fetchStats). "Satisfação" segue fora por não
// existir CSAT no produto (ver decisão registrada no roadmap).
function toCards(stats) {
  const s = stats || {};
  return [
    { label: 'Conversas ativas', value: String(s.totalActive ?? 0) },
    { label: 'Em atendimento', value: String(s.open ?? 0) },
    { label: 'Aguardando resposta', value: String(s.waiting ?? 0) },
    { label: 'Resolvidas hoje', value: String(s.resolvedToday ?? 0) },
    { label: 'Mensagens não lidas', value: String(s.unreadCount ?? 0) },
  ];
}

export function Metrics({ stats }) {
  const cards = toCards(stats);

  return h(
    'section',
    { className: 'metrics', 'aria-label': 'Indicadores rápidos' },
    cards.map(({ label, value }) =>
      h(
        'article',
        { key: label, className: 'metric-card' },
        h('span', null, label),
        h('strong', null, value),
      ),
    ),
  );
}
