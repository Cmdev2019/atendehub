import { BadRequestException } from '@nestjs/common';
import { MediaDownloadProcessor, MediaDownloadJobData } from './media-download.processor';
import { MediaDownloadService } from './media-download.service';

// B-76 (M-01): download da mídia recebida como job com retry. O que importa:
// idempotência (anexo já gravado não baixa de novo) e erro propagado (é ele
// que faz o Bull tentar de novo — antes a falha era engolida e o anexo se
// perdia para sempre).
describe('MediaDownloadProcessor (B-76)', () => {
  const mockPrisma = {
    attachment: { findFirst: jest.fn(), create: jest.fn() },
    message: { findUnique: jest.fn(), update: jest.fn() },
  };
  const mockMediaDownload = { downloadFromEvolution: jest.fn() };
  const mockEvents = { emitMessageUpdated: jest.fn() };
  const processor = new MediaDownloadProcessor(
    mockPrisma as any,
    mockMediaDownload as any,
    mockEvents as any,
  );

  const data: MediaDownloadJobData = {
    messageId: 'msg-1',
    conversationId: 'conv-1',
    companyId: 'company-1',
    sessionName: 'session-1',
    externalMessageId: 'wa-1',
    mimeType: 'image/jpeg',
  };
  const job = (attemptsMade = 0) => ({ data, attemptsMade, opts: { attempts: 6 } }) as any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.attachment.findFirst.mockResolvedValue(null);
    mockPrisma.message.findUnique.mockResolvedValue({ metadata: { remoteJid: 'x@s.whatsapp.net' } });
  });

  it('baixa pela Evolution, grava o anexo e avisa a UI (message.updated)', async () => {
    mockMediaDownload.downloadFromEvolution.mockResolvedValueOnce({
      url: 'http://localhost:9000/atendehub-media/company-1/images/a.jpg',
      mimeType: 'image/jpeg',
      size: 1234,
    });
    mockPrisma.attachment.create.mockResolvedValueOnce({
      id: 'att-1',
      url: 'http://localhost:9000/atendehub-media/company-1/images/a.jpg',
      mimeType: 'image/jpeg',
      fileName: null,
    });

    await processor.handle(job());

    expect(mockMediaDownload.downloadFromEvolution).toHaveBeenCalledWith(
      'session-1',
      'wa-1',
      'image/jpeg',
      'company-1',
      undefined,
    );
    expect(mockPrisma.attachment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ messageId: 'msg-1', mimeType: 'image/jpeg', size: 1234 }),
    });
    expect(mockEvents.emitMessageUpdated).toHaveBeenCalledWith(
      expect.objectContaining({ messageId: 'msg-1', attachment: expect.objectContaining({ id: 'att-1' }) }),
    );
  });

  it('não baixa de novo quando o anexo já existe (tentativa anterior gravou e caiu)', async () => {
    mockPrisma.attachment.findFirst.mockResolvedValueOnce({ id: 'att-1' });

    await processor.handle(job(1));

    expect(mockMediaDownload.downloadFromEvolution).not.toHaveBeenCalled();
    expect(mockPrisma.attachment.create).not.toHaveBeenCalled();
  });

  it('falha da Evolution propaga — o Bull agenda nova tentativa — e não grava anexo', async () => {
    mockMediaDownload.downloadFromEvolution.mockRejectedValueOnce(new Error('timeout'));

    await expect(processor.handle(job())).rejects.toThrow('timeout');
    expect(mockPrisma.attachment.create).not.toHaveBeenCalled();
    expect(mockEvents.emitMessageUpdated).not.toHaveBeenCalled();
  });

  // B-77 (M-03): antes o descarte era silencioso — o balão ficava com o
  // placeholder para sempre e o atendente nem sabia que havia um arquivo.
  it('tipo recusado pelo storage não é tentado de novo: registra o motivo na mensagem e avisa a UI', async () => {
    mockMediaDownload.downloadFromEvolution.mockRejectedValueOnce(
      new BadRequestException('Tipo de arquivo não permitido: application/x-msdownload'),
    );

    await expect(processor.handle(job())).resolves.toBeUndefined();

    expect(mockPrisma.message.update).toHaveBeenCalledWith({
      where: { id: 'msg-1' },
      // O metadata existente é preservado
      data: { metadata: { remoteJid: 'x@s.whatsapp.net', mediaError: 'unsupported_type' } },
    });
    expect(mockEvents.emitMessageUpdated).toHaveBeenCalledWith(
      expect.objectContaining({ messageId: 'msg-1', mediaError: 'unsupported_type' }),
    );
  });

  it('tentativas esgotadas registram download_failed; falha intermediária não registra nada', async () => {
    await processor.onFailed(job(3), new Error('timeout'));
    expect(mockPrisma.message.update).not.toHaveBeenCalled();

    await processor.onFailed(job(6), new Error('timeout'));
    expect(mockPrisma.message.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { metadata: expect.objectContaining({ mediaError: 'download_failed' }) },
      }),
    );
    expect(mockEvents.emitMessageUpdated).toHaveBeenCalledWith(
      expect.objectContaining({ mediaError: 'download_failed' }),
    );
  });

  // B-50: o fallback antigo baixava a URL vinda no conteúdo da mensagem
  // enviando a EVOLUTION_API_KEY no cabeçalho. A única origem é a Evolution.
  it('B-50: não existe caminho que baixe a URL vinda na mensagem', () => {
    expect((MediaDownloadService.prototype as any).downloadAndStore).toBeUndefined();
  });
});
