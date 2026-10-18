import { RequestIdMiddleware } from './request-id.middleware';
import { getRequestId } from './request-context';

describe('RequestIdMiddleware', () => {
  let middleware: RequestIdMiddleware;

  beforeEach(() => {
    middleware = new RequestIdMiddleware();
  });

  it('gera um requestId novo quando o header não vem preenchido e o expõe via getRequestId() dentro do next()', () => {
    const req = { headers: {} } as any;
    const res = { setHeader: jest.fn() } as any;
    let seenInsideNext: string | undefined;

    middleware.use(req, res, () => {
      seenInsideNext = getRequestId();
    });

    expect(seenInsideNext).toBeDefined();
    expect(res.setHeader).toHaveBeenCalledWith('x-request-id', seenInsideNext);
  });

  it('reaproveita o x-request-id recebido no header em vez de gerar um novo', () => {
    const req = { headers: { 'x-request-id': 'id-do-proxy-123' } } as any;
    const res = { setHeader: jest.fn() } as any;
    let seenInsideNext: string | undefined;

    middleware.use(req, res, () => {
      seenInsideNext = getRequestId();
    });

    expect(seenInsideNext).toBe('id-do-proxy-123');
    expect(res.setHeader).toHaveBeenCalledWith('x-request-id', 'id-do-proxy-123');
  });

  // B-94 (L-05): valor do cliente só entra se for um id curto e simples
  it.each([
    ['gigante', 'a'.repeat(500)],
    ['com quebra de linha (forjando log)', 'abc\nERROR falso'],
    ['com espaço', 'abc def'],
  ])('descarta x-request-id inválido (%s) e gera um novo', (_label, value) => {
    const req = { headers: { 'x-request-id': value } } as any;
    const res = { setHeader: jest.fn() } as any;
    let seen: string | undefined;

    middleware.use(req, res, () => {
      seen = getRequestId();
    });

    expect(seen).not.toBe(value);
    expect(seen).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('getRequestId() retorna undefined fora do contexto de uma requisição', () => {
    expect(getRequestId()).toBeUndefined();
  });
});
