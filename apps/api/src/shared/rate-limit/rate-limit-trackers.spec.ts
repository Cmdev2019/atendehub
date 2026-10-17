import { ExecutionContext } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createUserOrIpTracker, webhookInstanceTracker } from './rate-limit-trackers';

const ctx = {} as ExecutionContext;
const secret = 'segredo-de-teste-com-mais-de-32-caracteres';
const jwt = new JwtService({ secret });
const tracker = createUserOrIpTracker(jwt);

const req = (headers: Record<string, string> = {}, ip = '203.0.113.7', body?: unknown) => ({
  headers,
  ip,
  body,
});

describe('createUserOrIpTracker (C-04)', () => {
  it('token válido conta pelo usuário, não pelo IP', async () => {
    const token = jwt.sign({ sub: 'user-1', companyId: 'c1' });
    expect(await tracker(req({ authorization: `Bearer ${token}` }), ctx)).toBe('user:user-1');
  });

  it('dois usuários atrás do mesmo IP ganham cotas separadas', async () => {
    const a = jwt.sign({ sub: 'user-a' });
    const b = jwt.sign({ sub: 'user-b' });
    const ta = await tracker(req({ authorization: `Bearer ${a}` }, '198.51.100.1'), ctx);
    const tb = await tracker(req({ authorization: `Bearer ${b}` }, '198.51.100.1'), ctx);
    expect(ta).not.toBe(tb);
  });

  it('sem token conta pelo IP', async () => {
    expect(await tracker(req(), ctx)).toBe('ip:203.0.113.7');
  });

  it('token assinado com outro segredo não vira cota de usuário', async () => {
    const forged = new JwtService({ secret: 'outro-segredo-qualquer-com-32-chars!!' }).sign({
      sub: 'admin',
    });
    expect(await tracker(req({ authorization: `Bearer ${forged}` }), ctx)).toBe('ip:203.0.113.7');
  });

  it('token expirado conta pelo IP', async () => {
    const expired = jwt.sign({ sub: 'user-1', exp: Math.floor(Date.now() / 1000) - 10 });
    expect(await tracker(req({ authorization: `Bearer ${expired}` }), ctx)).toBe('ip:203.0.113.7');
  });

  it('cabeçalho que não é Bearer conta pelo IP', async () => {
    expect(await tracker(req({ authorization: 'Basic abc' }), ctx)).toBe('ip:203.0.113.7');
  });
});

describe('webhookInstanceTracker (C-04)', () => {
  it('conta pela instância de WhatsApp do corpo', async () => {
    expect(await webhookInstanceTracker(req({}, '10.0.0.5', { instance: 'empresa-a' }), ctx)).toBe(
      'webhook:empresa-a',
    );
  });

  it('instâncias diferentes vindas do mesmo IP (a Evolution) têm cotas separadas', async () => {
    const a = await webhookInstanceTracker(req({}, '10.0.0.5', { instance: 'a' }), ctx);
    const b = await webhookInstanceTracker(req({}, '10.0.0.5', { instance: 'b' }), ctx);
    expect(a).not.toBe(b);
  });

  it('sem instância válida no corpo conta pelo IP', async () => {
    expect(await webhookInstanceTracker(req({}, '10.0.0.5', undefined), ctx)).toBe('ip:10.0.0.5');
    expect(await webhookInstanceTracker(req({}, '10.0.0.5', { instance: 42 }), ctx)).toBe(
      'ip:10.0.0.5',
    );
    expect(
      await webhookInstanceTracker(req({}, '10.0.0.5', { instance: 'x'.repeat(101) }), ctx),
    ).toBe('ip:10.0.0.5');
  });
});
