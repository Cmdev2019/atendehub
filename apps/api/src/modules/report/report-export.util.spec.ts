import { Writable } from 'stream';
import { sendCsv, sendPdf } from './report-export.util';

// Res real de verdade (stream Writable) — doc.pipe(res) do PDFKit (sendPdf)
// exige uma implementação real de stream (.once/.emit/etc.); um objeto
// qualquer com só .send()/.set() não é suficiente, mesmo satisfazendo o
// tipo `Response` do Express na checagem estática.
function makeFakeRes() {
  const chunks: Buffer[] = [];
  const stream: any = new Writable({
    write(chunk, _enc, cb) {
      chunks.push(chunk);
      cb();
    },
  });
  stream.headers = {};
  stream.set = (h: Record<string, string>) => Object.assign(stream.headers, h);
  stream.send = (body: string) => chunks.push(Buffer.from(body, 'utf-8'));
  stream.getBuffer = () => Buffer.concat(chunks);
  return stream;
}

describe('report-export.util (B-33)', () => {
  describe('sendCsv', () => {
    it('gera CSV com BOM, cabeçalho e escapa vírgula/aspas dentro de célula', () => {
      const res = makeFakeRes();

      sendCsv(res, 'teste.csv', [
        { Contato: 'Marina', Status: 'CLOSED, "encerrada"' },
        { Contato: 'João', Status: 'WAITING' },
      ]);

      const content = res.getBuffer().toString('utf-8');
      expect(content.charCodeAt(0)).toBe(0xfeff); // BOM
      const lines = content.replace(/^﻿/, '').split('\n');
      expect(lines).toHaveLength(3);
      expect(lines[0]).toBe('Contato,Status');
      expect(lines[1]).toBe('Marina,"CLOSED, ""encerrada"""');
      expect(res.headers['Content-Type']).toContain('text/csv');
      expect(res.headers['Content-Disposition']).toContain('teste.csv');
    });

    it('não quebra com lista vazia', () => {
      const res = makeFakeRes();
      expect(() => sendCsv(res, 'vazio.csv', [])).not.toThrow();
    });
  });

  describe('sendPdf', () => {
    // Regressão: `import PDFDocument from 'pdfkit'` compila pra
    // `pdfkit_1.default` sem `esModuleInterop` no tsconfig — quebra em
    // runtime ("is not a constructor") mesmo com `tsc`/`nest build` limpo,
    // porque `allowSyntheticDefaultImports` só relaxa a checagem de TIPO,
    // não muda o JS emitido. Só um teste que executa `sendPdf` de verdade
    // pega isso — a suíte de `ReportService` só testava os `toXExportRows`.
    it('gera um PDF real (binário válido) sem lançar erro', (done) => {
      const res = makeFakeRes();
      res.on('finish', () => {
        const buffer = res.getBuffer();
        expect(buffer.slice(0, 4).toString()).toBe('%PDF');
        expect(buffer.slice(-7).toString()).toContain('%%EOF');
        done();
      });

      expect(() =>
        sendPdf(res, 'teste.pdf', 'Base de atendimento', 'Período: 01/01/2026 a 31/01/2026', [
          { Contato: 'Marina', Status: 'CLOSED' },
        ]),
      ).not.toThrow();
    });

    it('gera um PDF válido mesmo sem nenhuma linha', (done) => {
      const res = makeFakeRes();
      res.on('finish', () => {
        const buffer = res.getBuffer();
        expect(buffer.slice(0, 4).toString()).toBe('%PDF');
        done();
      });

      sendPdf(res, 'teste.pdf', 'Base de atendimento', 'Período: 01/01/2026 a 31/01/2026', []);
    });
  });
});
