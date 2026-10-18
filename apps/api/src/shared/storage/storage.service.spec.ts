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
    setBucketPolicy: jest.fn().mockResolvedValue(undefined),
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

  // ── B-38: bucket nunca pode ficar público — nem por omissão, nem por legado ──
  describe('onModuleInit', () => {
    it('cria o bucket se necessário e revoga qualquer bucket policy (bucket privado)', async () => {
      client.bucketExists.mockResolvedValue(false);

      await service.onModuleInit();

      expect(client.makeBucket).toHaveBeenCalledWith('atendehub-media');
      expect(client.setBucketPolicy).toHaveBeenCalledWith('atendehub-media', '');
    });

    // Achado na auditoria pós-hardening (2026-08-01, E2E contra MinIO real):
    // a versão original do B-38 só evitava aplicar policy pública em boots
    // NOVOS — não revogava uma policy pública que uma versão anterior do
    // código já tivesse deixado gravada no bucket (bucket policy é estado
    // persistente no MinIO, sobrevive a redeploys). Provado ao vivo: bucket
    // de dev continuava com leitura pública ativa (GET anônimo → 200) mesmo
    // depois do B-38 "concluído". `setBucketPolicy(bucket, '')` a cada boot
    // fecha isso: idempotente se já não houver policy, revoga se houver.
    it('revoga uma bucket policy pública LEGADA (deixada por uma versão anterior do código) mesmo quando o bucket já existe', async () => {
      client.bucketExists.mockResolvedValue(true);

      await service.onModuleInit();

      expect(client.makeBucket).not.toHaveBeenCalled();
      expect(client.setBucketPolicy).toHaveBeenCalledWith('atendehub-media', '');
    });

    it('não derruba o boot se a chamada de bucket policy falhar (ex.: MinIO fora do ar em dev)', async () => {
      client.bucketExists.mockResolvedValue(true);
      client.setBucketPolicy.mockRejectedValueOnce(new Error('MinIO fora do ar'));

      await expect(service.onModuleInit()).resolves.not.toThrow();
    });

    // B-64: no R2 o bucket é criado e mantido privado no painel — o R2 nem
    // implementa bucket policy, e chamar setBucketPolicy derrubaria o resto
    // da checagem com erro a cada boot.
    describe('com MINIO_MANAGE_BUCKET=false (storage gerenciado, R2)', () => {
      const managed = () => {
        const svc = new StorageService({
          get: (key: string, fallback?: any) =>
            ({ MINIO_ENDPOINT: 'https://conta.r2.cloudflarestorage.com', MINIO_MANAGE_BUCKET: 'false' } as Record<string, string>)[key] ??
            fallback,
        } as unknown as ConfigService);
        return { svc, minio: (svc as any).client };
      };

      it('só confere que o bucket existe — não cria nem mexe em policy', async () => {
        const { svc, minio } = managed();

        await svc.onModuleInit();

        expect(minio.bucketExists).toHaveBeenCalledWith('atendehub-media');
        expect(minio.makeBucket).not.toHaveBeenCalled();
        expect(minio.setBucketPolicy).not.toHaveBeenCalled();
      });

      it('bucket inexistente não é criado nem derruba o boot', async () => {
        const { svc, minio } = managed();
        minio.bucketExists.mockResolvedValueOnce(false);

        await expect(svc.onModuleInit()).resolves.not.toThrow();
        expect(minio.makeBucket).not.toHaveBeenCalled();
      });
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

  // ── C-07/B-59, revisto no B-64: URL assinada servida pelo domínio de mídia ──
  describe('endpoint público da mídia (C-07/B-64)', () => {
    const MinioClient = jest.requireMock('minio').Client as jest.Mock;

    const build = (values: Record<string, string>) =>
      new StorageService({
        get: (key: string, fallback?: any) => values[key] ?? fallback,
      } as unknown as ConfigService);

    beforeEach(() => MinioClient.mockClear());

    const R2 = {
      MINIO_ENDPOINT: 'https://conta.r2.cloudflarestorage.com',
      MINIO_PUBLIC_ENDPOINT: 'https://media.atendehub.com',
      MINIO_REGION: 'auto',
    };

    // O storage confere a assinatura contra o Host que recebe — que o nginx
    // repassa como o do R2. Assinar com o host do domínio de mídia (como no
    // B-59, com o MinIO atrás do nginx) daria 403 no R2.
    it('assina com o host do storage, num cliente só (região do .env)', async () => {
      const svc = build(R2);

      expect(MinioClient).toHaveBeenCalledTimes(1);
      expect(MinioClient.mock.calls[0][0]).toMatchObject({
        endPoint: 'conta.r2.cloudflarestorage.com',
        port: 443,
        useSSL: true,
        region: 'auto',
      });

      await svc.getPresignedUrl('images/a.jpg');
      expect(MinioClient.mock.results[0].value.presignedGetObject).toHaveBeenCalledWith(
        'atendehub-media',
        'images/a.jpg',
        600,
      );
    });

    it('troca só a origem pela do domínio de mídia, preservando caminho e query byte a byte', async () => {
      const svc = build(R2);
      const signed =
        'https://conta.r2.cloudflarestorage.com/atendehub-media/c1/images/a%20b.jpg' +
        '?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=k%2F20261018%2Fauto%2Fs3%2Faws4_request' +
        '&X-Amz-SignedHeaders=host&X-Amz-Signature=abc123';
      MinioClient.mock.results[0].value.presignedGetObject.mockResolvedValueOnce(signed);

      const url = await svc.getPresignedUrl('c1/images/a b.jpg');

      expect(url).toBe(signed.replace('https://conta.r2.cloudflarestorage.com', 'https://media.atendehub.com'));
    });

    it('sem MINIO_PUBLIC_ENDPOINT (dev), devolve a URL como foi assinada', async () => {
      const svc = build({ MINIO_ENDPOINT: 'http://localhost:9000' });

      expect(await svc.getPresignedUrl('images/a.jpg')).toBe('https://signed.example/images/a.jpg?expiry=600');
    });

    it('em produção, recusa subir sem MINIO_PUBLIC_ENDPOINT em https', () => {
      const prod = { NODE_ENV: 'production', MINIO_ROOT_USER: 'u', MINIO_ROOT_PASSWORD: 'p', MINIO_ENDPOINT: 'http://minio:9000' };
      expect(() => build(prod)).toThrow(/MINIO_PUBLIC_ENDPOINT/);
      expect(() => build({ ...prod, MINIO_PUBLIC_ENDPOINT: 'http://media.atendehub.com' })).toThrow(/https/);
      expect(() => build({ ...prod, MINIO_PUBLIC_ENDPOINT: 'https://media.atendehub.com' })).not.toThrow();
    });
  });
});
