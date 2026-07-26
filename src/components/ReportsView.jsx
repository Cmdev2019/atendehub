import { createElement as h, useEffect, useState } from 'react';
import { apiClient } from '../services/api';
import { Icon } from './icons';

function toDateInputValue(date) {
  return date.toISOString().slice(0, 10);
}

const today = new Date();
const defaultFrom = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);

function formatDateTime(value) {
  if (!value) return '—';
  return new Date(value).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

function formatHours(hours) {
  if (hours === null || hours === undefined) return '—';
  const h1 = Math.floor(hours);
  const m = Math.round((hours - h1) * 60);
  return `${h1}h ${m}min`;
}

// Cada relatório define suas colunas (chave do JSON + rótulo + formatador
// opcional) — a tabela genérica abaixo só itera essa config, sem `if` por
// tipo de relatório espalhado pelo componente.
const REPORT_TYPES = [
  {
    id: 'attendance',
    label: 'Base de atendimento',
    emptyMessage: 'Nenhuma conversa no período.',
    columns: [
      { key: 'contato', label: 'Contato' },
      { key: 'canal', label: 'Canal' },
      { key: 'atendente', label: 'Atendente' },
      { key: 'departamento', label: 'Departamento' },
      { key: 'status', label: 'Status' },
      { key: 'resolucao', label: 'Resolução' },
      { key: 'tags', label: 'Tags' },
      { key: 'criadaEm', label: 'Criada em', format: formatDateTime },
      { key: 'encerradaEm', label: 'Encerrada em', format: formatDateTime },
    ],
  },
  {
    id: 'by-tag',
    label: 'Por tipo de atendimento',
    emptyMessage: 'Nenhuma tag usada no período.',
    columns: [
      { key: 'tag', label: 'Tag' },
      { key: 'total', label: 'Total' },
      { key: 'resolvidas', label: 'Resolvidas' },
      { key: 'naoResolvidas', label: 'Não resolvidas' },
      { key: 'canceladas', label: 'Canceladas' },
      { key: 'tempoMedioResolucaoHoras', label: 'Tempo médio de resolução', format: formatHours },
    ],
  },
  {
    id: 'by-agent',
    label: 'Por atendente',
    emptyMessage: 'Nenhum atendente com atividade no período.',
    columns: [
      { key: 'atendente', label: 'Atendente' },
      { key: 'atendidas', label: 'Atendidas' },
      { key: 'resolvidas', label: 'Resolvidas' },
      { key: 'naoResolvidas', label: 'Não resolvidas' },
      { key: 'canceladas', label: 'Canceladas' },
      { key: 'emAberto', label: 'Em aberto' },
      { key: 'tempoMedioResolucaoHoras', label: 'Tempo médio de resolução', format: formatHours },
    ],
  },
];

// Dispara o download de um Blob no navegador — sem lib, é só um <a> temporário.
function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function ReportsView() {
  const [reportType, setReportType] = useState('attendance');
  const [from, setFrom] = useState(toDateInputValue(defaultFrom));
  const [to, setTo] = useState(toDateInputValue(today));
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(null); // 'csv' | 'pdf' | null
  const [exportError, setExportError] = useState(null);

  const activeReport = REPORT_TYPES.find((r) => r.id === reportType);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setExportError(null);

    (async () => {
      try {
        const result = await apiClient.getReport(reportType, { from, to });
        if (!cancelled) setRows(result?.rows || []);
      } catch (error) {
        console.warn('⚠️ Erro ao buscar relatório:', error.message);
        if (!cancelled) setRows([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [reportType, from, to]);

  const handleExport = async (format) => {
    setExporting(format);
    setExportError(null);
    try {
      const { blob, filename } = await apiClient.downloadReport(reportType, { from, to, format });
      triggerDownload(blob, filename);
    } catch (error) {
      setExportError(error?.message || 'Não foi possível gerar o arquivo.');
    } finally {
      setExporting(null);
    }
  };

  return h(
    'div',
    { className: 'reports-view' },
    h(
      'div',
      { className: 'section-header' },
      h('h2', null, h(Icon, { name: 'clipboard', size: 16 }), ' Relatórios'),
    ),
    h(
      'div',
      { className: 'reports-toolbar' },
      h(
        'select',
        {
          className: 'reports-type-select',
          'aria-label': 'Tipo de relatório',
          value: reportType,
          onChange: (e) => setReportType(e.target.value),
        },
        REPORT_TYPES.map((r) => h('option', { key: r.id, value: r.id }, r.label)),
      ),
      h('label', { className: 'reports-date-field' },
        'De',
        h('input', { type: 'date', value: from, max: to, onChange: (e) => setFrom(e.target.value) }),
      ),
      h('label', { className: 'reports-date-field' },
        'Até',
        h('input', { type: 'date', value: to, min: from, onChange: (e) => setTo(e.target.value) }),
      ),
      h(
        'div',
        { className: 'reports-export-actions' },
        h(
          'button',
          { type: 'button', className: 'btn-secondary', disabled: !!exporting, onClick: () => handleExport('csv') },
          exporting === 'csv' ? 'Gerando…' : 'Exportar CSV',
        ),
        h(
          'button',
          { type: 'button', className: 'btn-secondary', disabled: !!exporting, onClick: () => handleExport('pdf') },
          exporting === 'pdf' ? 'Gerando…' : 'Exportar PDF',
        ),
      ),
    ),
    exportError && h('div', { className: 'send-error', role: 'alert' }, h(Icon, { name: 'warning', size: 15 }), ` ${exportError}`),
    loading
      ? h('p', { className: 'dashboard-loading' }, 'Carregando relatório…')
      : rows.length === 0
      ? h('p', { className: 'reports-empty' }, activeReport.emptyMessage)
      : h(
          'div',
          { className: 'reports-table-wrap' },
          h(
            'table',
            { className: 'reports-table' },
            h('thead', null, h('tr', null, activeReport.columns.map((col) => h('th', { key: col.key }, col.label)))),
            h(
              'tbody',
              null,
              rows.map((row, i) =>
                h(
                  'tr',
                  { key: i },
                  activeReport.columns.map((col) =>
                    h('td', { key: col.key }, col.format ? col.format(row[col.key]) : String(row[col.key] ?? '—')),
                  ),
                ),
              ),
            ),
          ),
        ),
  );
}
