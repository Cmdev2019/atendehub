import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import axios from 'axios';
import * as http from 'http';
import { StorageService } from '../src/shared/storage/storage.service';

// keepAlive:false — em Docker Desktop no Windows, reusar socket via
// keep-alive entre requisições consecutivas nesta suíte (allow → deny →
// allow com URLs diferentes) intermitentemente resulta em ECONNRESET no
// port-forward do container; sem relação com o comportamento do MinIO ou do
// StorageService em si (reproduzido fora do Jest sem esse agente: sempre
// 200). Cada requisição abre sua própria conexão, eliminando a flakiness.
const httpAgent = new http.Agent({ keepAlive: false });

/**
 * B-38 — Teste E2E do storage (bucket privado + URL assinada).
 *
 * Diferente do spec unitário (que mocka o cliente `minio` inteiro e só prova
 * que o CÓDIGO nunca chama `setBucketPolicy`), este teste sobe o
 * StorageService de verdade contra o MinIO real (mesma config de
 * app.module.ts) e faz requisições HTTP cruas contra o bucket — a única
 * forma de provar que a proteção também existe no nível do PROTOCOLO S3, não
 * só na intenção do código: mesmo que algum dia um `setBucketPolicy` público
 * volte a ser chamado em outro lugar (nova migration, script manual, `mc`
 * rodado à mão), este teste detecta pelo comportamento observável de fora,
 * não pela ausência de uma chamada de função.
 *
 * Pré-requisito: MinIO rodando em localhost:9000 (`docker compose up -d minio`).
 * Roda isolado do `npm test` normal via `npm run test:e2e`.
 */
describe('Storage — E2E (MinIO real, bucket privado + URL assinada)', () => {
  jest.setTimeout(20000);

  let module: TestingModule;
  let service: StorageService;
  let uploadedUrl: string;
  const companyId = 'e2e-b38-storage';

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' })],
      providers: [StorageService],
    }).compile();

    service = module.get(StorageService);
    await service.onModuleInit();
  });

  afterAll(async () => {
    if (uploadedUrl) await service.deleteByUrl(uploadedUrl).catch(() => undefined);
    await module.close();
  });

  it('faz upload real de um objeto no MinIO', async () => {
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
    const result = await service.upload(jpeg, 'image/jpeg', companyId, 'teste-e2e.jpg');

    expect(result.key).toMatch(new RegExp(`^${companyId}/images/`));
    uploadedUrl = result.url;
  });

  it('nega acesso HTTP direto e anônimo ao objeto — a prova real de que o bucket é privado (B-38)', async () => {
    // Requisição SEM assinatura, direto no endpoint interno do MinIO — é
    // exatamente o que qualquer pessoa na internet conseguiria tentar se
    // conhecesse a URL de um attachment. Antes do B-38 isso devolvia 200
    // com o arquivo (bucket com policy pública de leitura); depois, o MinIO
    // recusa por não haver nenhuma policy de leitura anônima.
    const response = await axios.get(uploadedUrl, {
      httpAgent,
      validateStatus: () => true, // não lançar — queremos inspecionar o status
    });

    expect([403, 404]).toContain(response.status);
  });

  it('permite acesso ao MESMO objeto via URL assinada (presignUrl) — o único caminho válido', async () => {
    const signed = await service.presignUrl(uploadedUrl);
    expect(signed).toBeTruthy();
    expect(signed).not.toBe(uploadedUrl); // URL trocada, não a interna

    const response = await axios.get(signed as string, {
      httpAgent,
      responseType: 'arraybuffer',
      validateStatus: () => true,
    });

    expect(response.status).toBe(200);
    expect(Buffer.from(response.data).subarray(0, 3)).toEqual(Buffer.from([0xff, 0xd8, 0xff])); // magic bytes JPEG
  });

  it('URL assinada com expiração de 1s deixa de funcionar depois de expirar', async () => {
    const shortLived = await service.presignUrl(uploadedUrl, 1);
    expect(shortLived).toBeTruthy();

    // Confirma que funciona enquanto válida...
    const ok = await axios.get(shortLived as string, { httpAgent, validateStatus: () => true });
    expect(ok.status).toBe(200);

    // ...e passa a negar depois de expirar (assinatura S3 tem o timestamp
    // embutido — não tem como "esperar menos" nem reaproveitar).
    await new Promise((resolve) => setTimeout(resolve, 2000));
    const expired = await axios.get(shortLived as string, { httpAgent, validateStatus: () => true });
    expect(expired.status).not.toBe(200);
  });
});
