import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { StorageService } from './storage.service';

// A URL salva em Attachment.url é a URL pública completa
// (`${publicUrl}/${bucket}/${key}`), não a key isolada — deleteByUrl (B-29)
// precisa recortar o prefixo certo antes de chamar o MinIO.
jest.mock('minio', () => ({
  Client: jest.fn().mockImplementation(() => ({
    bucketExists: jest.fn(),
    makeBucket: jest.fn(),
    setBucketPolicy: jest.fn(),
    removeObject: jest.fn().mockResolvedValue(undefined),
  })),
}));

describe('StorageService#deleteByUrl (B-29)', () => {
  let service: StorageService;
  let removeObjectMock: jest.Mock;

  const mockConfig = {
    get: jest.fn((key: string, fallback?: any) => {
      const values: Record<string, string> = {
        MINIO_ENDPOINT: 'http://localhost:9000',
        MINIO_BUCKET: 'atendehub-media',
      };
      return values[key] ?? fallback;
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [StorageService, { provide: ConfigService, useValue: mockConfig }],
    }).compile();

    service = module.get<StorageService>(StorageService);
    removeObjectMock = (service as any).client.removeObject;
    removeObjectMock.mockClear();
  });

  it('recorta o prefixo publicUrl/bucket/ e deleta só a key', async () => {
    await service.deleteByUrl(
      'http://localhost:9000/atendehub-media/company-1/images/foo.jpg',
    );

    expect(removeObjectMock).toHaveBeenCalledWith(
      'atendehub-media',
      'company-1/images/foo.jpg',
    );
  });

  it('rejeita uma URL que não pertence ao bucket configurado, sem chamar o MinIO', async () => {
    await expect(
      service.deleteByUrl('http://evil.example/other-bucket/x.jpg'),
    ).rejects.toThrow(/fora do bucket esperado/);

    expect(removeObjectMock).not.toHaveBeenCalled();
  });
});
