// B-93 (L-04): lista de origens do CORS, usada pela API HTTP e pelo
// WebSocket. Antes, `split(',')` sem `trim()` quebrava a 2ª origem de uma
// lista escrita com espaço depois da vírgula ("https://a.com, https://b.com").
export function parseCorsOrigins(raw: string | undefined): string[] {
  const origins = (raw ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  return origins.length > 0 ? origins : ['http://localhost:3000'];
}
