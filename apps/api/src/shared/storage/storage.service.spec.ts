import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StorageService } from './storage.service';

// A URL salva em Attachment.url/User.avatarUrl é a URL "interna" completa
// (`${internalEndpoint}/${bucket}/${key}`), não a key isolada — deleteByUrl
// (B-29) e presignUrl (B-38) precisam recortar o prefixo certo antes de
// chamar o MinIO.
jest.mock('minio', () => ({
  Client: jest.fn().mockImplementation(() => ({
    bucketExists: jest.fn().mockResolvedValue(true),
    makeBucket: jest.fn(),
    setBucketPolicy: jest.fn(),
    removeObject: jest.fn().mockResolvedValue(undefined),
    putObject: jest.fn().mockResolvedValue(undefined),
    presignedGetObject: jest
      .fn()
      .mockImplementation((_bucket: string, key: string, expiry: number) =>
        Promise.resolve(`https://signed.example/${key}?expiry=${expiry}`),
      ),
  })),
}));

const JPEG_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const NOT_AN_IMAGE = Buffer.from('isto nao e uma imagem de verdade');

describe('StorageService', () => {
  let service: StorageService;
  let client: any;

  const mockConfig = {
    get: jest.fn((key: string, fallback?: any) => {
      const values: Record<string, string> = {
        MINIO_ENDPOINT: 'http://localhost:9000',
        MINIO_BUCKET: 'atendehub-media',
        MEDIA_SIGNED_URL_EXPIRATION: '600',
      };
      return values[key] ?? fallback;
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [StorageService, { provide: ConfigService, useValue: mockConfig }],
    }).compile();

    service = module.get<StorageService>(StorageService);
    client = (service as any).client;
    jest.clearAllMocks();
  });

  // ── B-38: bucket nunca pode virar público ──────────────────────────────────
  describe('onModuleInit', () => {
    it('cria o bucket se necessário e NUNCA aplica bucket policy (bucket permanece privado)', async () => {
      client.bucketExists.mockResolvedValue(false);

      await service.onModuleInit();

      expect(client.makeBucket).toHaveBeenCalledWith('atendehub-media');
      expect(client.setBucketPolicy).not.toHaveBeenCalled();
    });

    it('não aplica policy nenhuma mesmo quando o bucket já existe', async () => {
      client.bucketExists.mockResolvedValue(true);

      await service.onModuleInit();

      expect(client.makeBucket).not.toHaveBeenCalled();
      expect(client.setBucketPolicy).not.toHaveBeenCalled();
    });
  });

  // ── deleteByUrl (B-29) ───────────────────────────────────────────────────────
  describe('deleteByUrl', () => {
    it('recorta o prefixo internalEndpoint/bucket/ e deleta só a key', async () => {
      await service.deleteByUrl(
        'http://localhost:9000/atendehub-media/company-1/images/foo.jpg',
      );

      expect(client.removeObject).toHaveBeenCalledWith(
        'atendehub-media',
        'company-1/images/foo.jpg',
      );
    });

    it('rejeita uma URL que não pertence ao bucket configurado, sem chamar o MinIO', async () => {
      await expect(
        service.deleteByUrl('http://evil.example/other-bucket/x.jpg'),
      ).rejects.toThrow(/fora do bucket esperado/);

      expect(client.removeObject).not.toHaveBeenCalled();
    });
  });

  // ── presignUrl / presignDeep (B-38) ────────────────────────────────────────
  describe('presignUrl', () => {
    it('troca uma URL interna por uma URL assinada com a expiração padrão do .env', async () => {
      const result = await service.presignUrl(
        'http://localhost:9000/atendehub-media/company-1/images/foo.jpg',
      );

      expect(client.presignedGetObject).toHaveBeenCalledWith(
        'atendehub-media',
        'company-1/images/foo.jpg',
        600,
      );
      expect(result).toBe(
        'https://signed.example/company-1/images/foo.jpg?expiry=600',
      );
    });

    it('respeita uma expiração explícita passada pelo chamador', async () => {
      await service.presignUrl(
        'http://localhost:9000/atendehub-media/company-1/images/foo.jpg',
        30,
      );

      expect(client.presignedGetObject).toHaveBeenCalledWith(
        'atendehub-media',
        'company-1/images/foo.jpg',
        30,
      );
    });

    it('não mexe em URL externa (ex.: foto de perfil servida pela própria Evolution/WhatsApp)', async () => {
      const external = 'https://pps.whatsapp.net/v/t61/foo.jpg';

      const result = await service.presignUrl(external);

      expect(result).toBe(external);
      expect(client.presignedGetObject).not.toHaveBeenCalled();
    });

    it('passa null/undefined direto, sem chamar o MinIO', async () => {
      expect(await service.presignUrl(null)).toBeNull();
      expect(await service.presignUrl(undefined)).toBeUndefined();
      expect(client.presignedGetObject).not.toHaveBeenCalled();
    });

    it('nunca vaza a URL interna de volta em caso de falha do MinIO — retorna null', async () => {
      client.presignedGetObject.mockRejectedValueOnce(new Error('MinIO fora do ar'));

      const result = await service.presignUrl(
        'http://localhost:9000/atendehub-media/company-1/images/foo.jpg',
      );

      expect(result).toBeNull();
    });
  });

  describe('presignDeep', () => {
    it('percorre objeto aninhado e troca só as URLs internas, preservando o resto', async () => {
      const payload = {
        id: 'msg-1',
        sentAt: new Date('2026-01-01T00:00:00Z'),
        sender: { name: 'Agente', avatarUrl: 'http://localhost:9000/atendehub-media/u/1.png' },
        attachments: [
          { id: 'a1', url: 'http://localhost:9000/atendehub-media/c1/images/x.jpg', mimeType: 'image/jpeg' },
          { id: 'a2', url: 'https://pps.whatsapp.net/external.jpg', mimeType: 'image/jpeg' },
        ],
      };

      const result: any = await service.presignDeep(payload);

      expect(result.id).toBe('msg-1');
      expect(result.sentAt).toEqual(payload.sentAt);
      expect(result.sender.avatarUrl).toBe('https://signed.example/u/1.png?expiry=600');
      expect(result.attachments[0].url).toBe(
        'https://signed.example/c1/images/x.jpg?expiry=600',
      );
      expect(result.attachments[1].url).toBe('https://pps.whatsapp.net/external.jpg');
    });
  });

  // ── upload (B-38) ────────────────────────────────────────────────────────────
  describe('upload', () => {
    it('rejeita MIME type fora da allowlist (defesa contra upload arbitrário)', async () => {
      await expect(
        service.upload(Buffer.from('conteudo'), 'application/x-php', 'company-1'),
      ).rejects.toThrow(BadRequestException);

      expect(client.putObject).not.toHaveBeenCalled();
    });

    it('rejeita imagem cujo conteúdo não bate com o MIME declarado (defesa contra spoofing)', async () => {
      await expect(
        service.upload(NOT_AN_IMAGE, 'image/jpeg', 'company-1'),
      ).rejects.toThrow(/não corresponde ao tipo declarado/);

      expect(client.putObject).not.toHaveBeenCalled();
    });

    it('aceita imagem cujos magic bytes batem com o MIME declarado', async () => {
      const result = await service.upload(JPEG_BYTES, 'image/jpeg', 'company-1');

      expect(client.putObject).toHaveBeenCalled();
      expect(result.key).toMatch(/^company-1\/images\/[a-f0-9-]{36}\.jpg$/);
    });

    it('ignora a extensão/diretório do nome original — key vem só do MIME validado (anti directory traversal)', async () => {
      const result = await service.upload(
        JPEG_BYTES,
        'image/jpeg',
        'company-1',
        '../../../etc/passwd.png',
      );

      expect(result.key).toMatch(/^company-1\/images\/[a-f0-9-]{36}\.jpg$/);
      expect(result.key).not.toContain('..');
      expect(result.key).not.toContain('passwd');
    });

    it('não faz cross-check de magic bytes fora da família imagem (documento/áudio/vídeo)', async () => {
      const result = await service.upload(
        Buffer.from('qualquer conteudo de pdf'),
        'application/pdf',
        'company-1',
      );

      expect(client.putObject).toHaveBeenCalled();
      expect(result.key).toMatch(/\.pdf$/);
    });
  });
});
