import { parseCorsOrigins } from './cors-origins';

describe('parseCorsOrigins (B-93)', () => {
  it('tira espaços em volta de cada origem', () => {
    expect(parseCorsOrigins('https://a.com, https://b.com ,https://c.com')).toEqual([
      'https://a.com',
      'https://b.com',
      'https://c.com',
    ]);
  });

  it('ignora entradas vazias e cai no padrão de desenvolvimento sem nada', () => {
    expect(parseCorsOrigins('https://a.com,,')).toEqual(['https://a.com']);
    expect(parseCorsOrigins(undefined)).toEqual(['http://localhost:3000']);
    expect(parseCorsOrigins(' ')).toEqual(['http://localhost:3000']);
  });
});
