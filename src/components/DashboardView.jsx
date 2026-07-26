import { createElement as h, useEffect, useState } from 'react';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { apiClient } from '../services/api';
import { Icon } from './icons';

const emptySummary = {
  totalConversations: 0,
  attended: 0,
  notAttended: 0,
  totalClosed: 0,
  resolved: 0,
  unresolved: 0,
  unlabeled: 0,
};

const ATTENDANCE_COLORS = ['#0f766e', '#f59e0b']; // atendido, não atendido
const RESOLUTION_COLORS = ['#0f766e', '#dc2626', '#94a3b8']; // resolvida, não resolvida, sem registro

function donutData(summary) {
  return {
    attendance: [
      { name: 'Atendidos', value: summary.attended },
      { name: 'Não atendidos', value: summary.notAttended },
    ],
    resolution: [
      { name: 'Resolvidas', value: summary.resolved },
      { name: 'Não resolvidas', value: summary.unresolved },
      { name: 'Sem registro', value: summary.unlabeled },
    ].filter((slice) => slice.value > 0),
  };
}

// Donut sem nenhum dado ainda (empresa nova, ou período sem chamados) —
// Recharts não desenha nada com todo mundo em 0; mostra um texto simples em
// vez de um gráfico vazio confuso.
function DonutCard({ title, data, colors }) {
  const hasData = data.some((slice) => slice.value > 0);

  return h(
    'article',
    { className: 'dashboard-chart-card' },
    h('h3', null, title),
    hasData
      ? h(
          ResponsiveContainer,
          { width: '100%', height: 220 },
          h(
            PieChart,
            null,
            h(
              Pie,
              { data, dataKey: 'value', nameKey: 'name', innerRadius: 55, outerRadius: 85, paddingAngle: 2 },
              data.map((_, i) => h(Cell, { key: i, fill: colors[i % colors.length] })),
            ),
            h(Tooltip, null),
            h(Legend, { verticalAlign: 'bottom', height: 32 }),
          ),
        )
      : h('p', { className: 'dashboard-chart-empty' }, 'Sem dados no período.'),
  );
}

export function DashboardView() {
  const [summary, setSummary] = useState(emptySummary);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const result = await apiClient.getDashboardSummary();
        if (!cancelled && result) setSummary(result);
      } catch (error) {
        console.warn('⚠️ Erro ao buscar resumo do dashboard:', error.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const { attendance, resolution } = donutData(summary);

  const cards = [
    { label: 'Chamados no período', value: summary.totalConversations, note: 'total' },
    { label: 'Atendidos', value: summary.attended, note: 'tiveram um agente' },
    { label: 'Não atendidos', value: summary.notAttended, note: 'ainda sem agente' },
    { label: 'Resolvidos', value: summary.resolved, note: 'de ' + summary.totalClosed + ' encerrados' },
    { label: 'Não resolvidos', value: summary.unresolved, note: 'de ' + summary.totalClosed + ' encerrados' },
  ];

  return h(
    'div',
    { className: 'dashboard-view' },
    h(
      'div',
      { className: 'section-header' },
      h('h2', null, h(Icon, { name: 'chart', size: 16 }), ' Dashboard'),
      h('span', { className: 'dashboard-period-note' }, 'Últimos 30 dias'),
    ),
    loading
      ? h('p', { className: 'dashboard-loading' }, 'Carregando indicadores…')
      : h(
          'div',
          null,
          h(
            'section',
            { className: 'metrics', 'aria-label': 'Indicadores do dashboard' },
            cards.map(({ label, value, note }) =>
              h(
                'article',
                { key: label, className: 'metric-card' },
                h('span', null, label),
                h('strong', null, String(value)),
                h('small', null, note),
              ),
            ),
          ),
          h(
            'section',
            { className: 'dashboard-charts' },
            h(DonutCard, { title: 'Atendidos x não atendidos', data: attendance, colors: ATTENDANCE_COLORS }),
            h(DonutCard, { title: 'Resolvidas x não resolvidas', data: resolution, colors: RESOLUTION_COLORS }),
          ),
        ),
  );
}
