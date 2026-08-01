// ── Extração de telefone/id a partir de um JID do WhatsApp ─────────────────
// Consolidado aqui (B-39 hardening) — a mesma lógica vivia duplicada em 3
// lugares (evolution.service.ts, webhook.service.ts×2), cada um reinventado
// numa sessão diferente. Genérico por domínio (@s.whatsapp.net, @c.us,
// @lid...) em vez de enumerar cada um — cobre qualquer domínio futuro sem
// precisar de nova lista.
//
// "5511999999999:12@s.whatsapp.net" → "5511999999999" (":12" é id de
// dispositivo, não faz parte do número).
//
// @lid é o identificador de privacidade do WhatsApp: quando presente, o
// valor retornado NÃO é um número discável de verdade — é um id opaco,
// ainda assim estável o bastante pra servir de chave do contato. Use
// `isOpaqueLidJid` pra decidir se vale avisar sobre isso.
export function extractPhoneFromJid(jid?: string | null): string {
  if (!jid) return '';
  const [id] = jid.split('@');
  return (id ?? '').split(':')[0];
}

export function isOpaqueLidJid(jid?: string | null): boolean {
  if (!jid) return false;
  const domain = jid.split('@')[1];
  return domain === 'lid';
}
