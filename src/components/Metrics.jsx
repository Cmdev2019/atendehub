import { createElement as h } from 'react';

const metrics = [
  { label: 'Conversas abertas', value: '34', note: '6 urgentes' },
  { label: 'Primeira resposta', value: '2m 41s', note: 'Meta: 5 min' },
  { label: 'Resolvidas hoje', value: '128', note: '+18% vs. ontem' },
  { label: 'Satisfação', value: '92%', note: '384 avaliações' },
];

export function Metrics() {
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
