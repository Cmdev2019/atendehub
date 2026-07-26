import { createElement as h, useEffect, useState } from 'react';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { apiClient } from '../services/api';
import { Icon } from './icons';

const emptyStats = {
  awaitingReply: 0,
  myAwaitingReply: 0,
};

const emptySummary = {
  totalConversations: 0,
  attended: 0,
  notAttended: 0,
  totalClosed: 0,
  resolved: 0,
  unresolved: 0,
  cancelled: 0,
  unlabeled: 0,
};

const ATTENDANCE_COLORS = ['#0f766e', '#f59e0b']; // atendido, não atendido
// resolvida, não resolvida, cancelada (B-36), sem registro
const RESOLUTION_COLORS = ['#0f766e', '#dc2626', '#94a3b8', '#cbd5e1'];

function donutData(summary) {
  return {
    attendance: [
      { name: 'Atendidos', value: summary.attended },
      { name: 'Não atendidos', value: summary.notAttended },
    ],
    resolution: [
      { name: 'Resolvidas', value: summary.resolved },
      { name: 'Não resolvidas', value: summary.unresolved },
      { name: 'Canceladas', value: summary.cancelled },
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

// Fileira de cards numéricos — mesmo padrão visual de Metrics.jsx, mas
// dentro do dashboard (rótulo próprio por seção, já que aqui misturamos
// dado em tempo real com dado por período, ver comentário mais abaixo).
function StatRow({ label, cards }) {
  return h(
    'section',
    { className: 'dashboard-stat-group' },
    h('h3', { className: 'dashboard-stat-group-title' }, label),
    h(
      'div',
      { className: 'metrics', 'aria-label': label },
      cards.map(({ label: cardLabel, value }) =>
        h(
          'article',
          { key: cardLabel, className: 'metric-card' },
          h('span', null, cardLabel),
          h('strong', null, String(value)),
        ),
      ),
    ),
  );
}

export function DashboardView() {
  const [stats, setStats] = useState(emptyStats);
  const [summary, setSummary] = useState(emptySummary);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const [statsResult, summaryResult] = await Promise.all([
          apiClient.getConversationStats(),
          apiClient.getDashboardSummary(),
        ]);
        if (cancelled) return;
        if (statsResult) setStats(statsResult);
        if (summaryResult) setSummary(summaryResult);
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

  // "Resumo de conversas" (Todas/Minhas/Não atendidas/Em atendimento/
  // Vencidas por SLA) saiu do dashboard a pedido do usuário — o mesmo
  // retrato de agora já existe na Caixa de Entrada via Metrics.jsx, então
  // fica só lá, sem duplicar. "Sem resposta" continua aqui (sem
  // equivalente na Caixa de Entrada).
  const awaitingReplyCards = [
    { label: 'Todas', value: stats.awaitingReply },
    { label: 'Minhas', value: stats.myAwaitingReply },
  ];

  const periodCards = [
    { label: 'Chamados no período', value: summary.totalConversations },
    { label: 'Atendidos', value: summary.attended },
    { label: 'Não atendidos', value: summary.notAttended },
    { label: 'Resolvidos', value: summary.resolved },
    { label: 'Não resolvidos', value: summary.unresolved },
    { label: 'Cancelados', value: summary.cancelled },
  ];

  return h(
    'div',
    { className: 'dashboard-view' },
    h(
      'div',
      { className: 'section-header' },
      h('h2', null, h(Icon, { name: 'chart', size: 16 }), ' Dashboard'),
    ),
    loading
      ? h('p', { className: 'dashboard-loading' }, 'Carregando indicadores…')
      : h(
          'div',
          null,
          h(StatRow, { label: 'Sem resposta do atendente (agora)', cards: awaitingReplyCards }),
          h(StatRow, { label: 'Últimos 30 dias', cards: periodCards }),
          h(
            'section',
            { className: 'dashboard-charts' },
            h(DonutCard, { title: 'Atendidos x não atendidos', data: attendance, colors: ATTENDANCE_COLORS }),
            h(DonutCard, { title: 'Resultado do encerramento', data: resolution, colors: RESOLUTION_COLORS }),
          ),
        ),
  );
}
