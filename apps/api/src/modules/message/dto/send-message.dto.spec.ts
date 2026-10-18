import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { VALIDATION_PIPE_OPTIONS } from '../../../shared/http/http-pipeline';
import { SendMessageDto } from './send-message.dto';

// B-75 (M-11): POST .../messages envia só texto. A mídia por URL (buscada pela
// Evolution dentro da rede do servidor — SSRF) foi retirada; mídia vai por
// upload em POST .../messages/media.
describe('SendMessageDto (B-75)', () => {
  const pipe = new ValidationPipe(VALIDATION_PIPE_OPTIONS);
  const validate = (body: unknown) =>
    pipe.transform(body, { type: 'body', metatype: SendMessageDto });

  it('aceita texto', async () => {
    await expect(validate({ type: 'TEXT', content: 'Olá' })).resolves.toEqual(
      expect.objectContaining({ type: 'TEXT', content: 'Olá' }),
    );
  });

  it('assume TEXT quando o tipo não vem', async () => {
    await expect(validate({ content: 'Olá' })).resolves.toEqual(
      expect.objectContaining({ type: 'TEXT' }),
    );
  });

  it.each([
    ['URL pública', 'https://exemplo.com/foto.jpg'],
    ['metadados da nuvem', 'http://169.254.169.254/latest/meta-data/'],
    ['IPv6 de loopback', 'http://[::1]:9000/bucket'],
    ['nome interno do Docker', 'http://minio:9000/atendehub/x.jpg'],
  ])('recusa mídia por URL (%s)', async (_label, mediaUrl) => {
    await expect(validate({ type: 'IMAGE', mediaUrl })).rejects.toThrow(BadRequestException);
  });

  it('recusa mediaUrl até junto de texto (campo não existe mais)', async () => {
    await expect(
      validate({ type: 'TEXT', content: 'Olá', mediaUrl: 'https://exemplo.com/x.jpg' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('recusa texto vazio', async () => {
    await expect(validate({ type: 'TEXT', content: '' })).rejects.toThrow(BadRequestException);
  });
});
