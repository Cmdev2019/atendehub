import { resolveTrustProxy } from './trust-proxy';

describe('resolveTrustProxy (C-04)', () => {
  it('sem TRUST_PROXY, confia em 1 proxy em produção (o nginx)', () => {
    expect(resolveTrustProxy(undefined, true)).toBe(1);
    expect(resolveTrustProxy('', true)).toBe(1);
    expect(resolveTrustProxy('   ', true)).toBe(1);
  });

  it('sem TRUST_PROXY, não confia em nenhum proxy fora de produção', () => {
    expect(resolveTrustProxy(undefined, false)).toBe(false);
    expect(resolveTrustProxy('', false)).toBe(false);
  });

  it('false/0 desligam mesmo em produção', () => {
    expect(resolveTrustProxy('false', true)).toBe(false);
    expect(resolveTrustProxy('0', true)).toBe(false);
  });

  it('número vira quantidade de proxies', () => {
    expect(resolveTrustProxy('2', true)).toBe(2);
    expect(resolveTrustProxy(' 1 ', false)).toBe(1);
  });

  it('lista de endereços é repassada ao Express como texto', () => {
    expect(resolveTrustProxy('loopback, 10.0.0.0/8', true)).toBe('loopback, 10.0.0.0/8');
  });
});
