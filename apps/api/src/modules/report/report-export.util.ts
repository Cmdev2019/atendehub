import type { Response } from 'express';
// CommonJS puro (`module.exports = PDFDocument`, sem `.default`) — sem
// `esModuleInterop` no tsconfig deste projeto, `import PDFDocument from
// 'pdfkit'` compila pra `pdfkit_1.default` e quebra em runtime
// ("is not a constructor"), mesmo com o build (tsc) passando limpo (só
// `allowSyntheticDefaultImports` afeta checagem de tipo, não o JS emitido).
// Mesmo padrão já usado pra `compression` em `main.ts`.
import * as PDFDocument from 'pdfkit';

// Linha já formatada pra exibição: chave = cabeçalho em PT-BR, valor = texto
// pronto (datas/duração já formatadas) — o mesmo shape alimenta CSV e PDF,
// pra não duplicar a lógica de formatação em dois lugares.
export type ExportRow = Record<string, string>;

function escapeCsvValue(value: string) {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

// BOM no início: sem ele, o Excel no Windows abre acentuação em PT-BR como
// lixo (interpreta o arquivo como Latin-1 em vez de UTF-8).
export function sendCsv(res: Response, filename: string, rows: ExportRow[]) {
  const headers = rows.length > 0 ? Object.keys(rows[0]) : [];
  const lines = [
    headers.join(','),
    ...rows.map((row) => headers.map((h) => escapeCsvValue(row[h] ?? '')).join(',')),
  ];

  res.set({
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="${filename}"`,
  });
  const BOM = '﻿';
  res.send(BOM + lines.join('\n'));
}

// PDFKit não tem suporte nativo a tabela — desenha texto célula a célula,
// com paginação manual quando as linhas passam do fim da página.
export function sendPdf(
  res: Response,
  filename: string,
  title: string,
  periodLabel: string,
  rows: ExportRow[],
) {
  const doc = new PDFDocument({ margin: 40, size: 'A4', layout: 'landscape' });
  res.set({
    'Content-Type': 'application/pdf',
    'Content-Disposition': `attachment; filename="${filename}"`,
  });
  doc.pipe(res);

  doc.fontSize(16).font('Helvetica-Bold').text(title);
  doc.fontSize(9).font('Helvetica').fillColor('#666').text(periodLabel);
  doc.fillColor('#000');
  doc.moveDown();

  if (rows.length === 0) {
    doc.fontSize(11).text('Nenhum dado no período.');
    doc.end();
    return;
  }

  const headers = Object.keys(rows[0]);
  const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const colWidth = pageWidth / headers.length;
  const rowHeight = 20;

  const drawRow = (values: string[], y: number, bold: boolean) => {
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(8);
    values.forEach((val, i) => {
      doc.text(val, doc.page.margins.left + i * colWidth, y, {
        width: colWidth - 4,
        ellipsis: true,
      });
    });
  };

  let y = doc.y + 10;
  drawRow(headers, y, true);
  y += rowHeight;
  doc
    .moveTo(doc.page.margins.left, y - 4)
    .lineTo(doc.page.width - doc.page.margins.right, y - 4)
    .strokeColor('#ccc')
    .stroke();

  for (const row of rows) {
    if (y > doc.page.height - doc.page.margins.bottom - rowHeight) {
      doc.addPage();
      y = doc.page.margins.top;
      drawRow(headers, y, true);
      y += rowHeight;
    }
    drawRow(
      headers.map((h) => row[h] ?? ''),
      y,
      false,
    );
    y += rowHeight;
  }

  doc.end();
}
