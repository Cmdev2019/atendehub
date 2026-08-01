import { extractPhoneFromJid, isOpaqueLidJid } from './jid.util';

// B-39: consolidado de 3 implementações duplicadas (evolution.service.ts,
// webhook.service.ts×2) — cobertura de regressão direta pros casos que já
// causaram incidente em produção antes de existir um lugar único (F0-11,
// F0-13, ver ROADMAP_ESTABILIZACAO.md).
describe('jid.util', () => {
  describe('extractPhoneFromJid', () => {
    it('extrai o número de um JID padrão @s.whatsapp.net', () => {
      expect(extractPhoneFromJid('5512999999999@s.whatsapp.net')).toBe('5512999999999');
    });

    it('remove o sufixo de dispositivo (":NN")', () => {
      expect(extractPhoneFromJid('5512999999999:12@s.whatsapp.net')).toBe('5512999999999');
    });

    it('extrai o número de um JID @c.us', () => {
      expect(extractPhoneFromJid('5512999999999@c.us')).toBe('5512999999999');
    });

    it('extrai o id opaco de um JID @lid (número oculto)', () => {
      expect(extractPhoneFromJid('179542585000066@lid')).toBe('179542585000066');
    });

    it('funciona também sem domínio (@) — número puro', () => {
      expect(extractPhoneFromJid('5512999999999')).toBe('5512999999999');
    });

    it('retorna string vazia para JID ausente', () => {
      expect(extractPhoneFromJid(undefined)).toBe('');
      expect(extractPhoneFromJid(null)).toBe('');
      expect(extractPhoneFromJid('')).toBe('');
    });
  });

  describe('isOpaqueLidJid', () => {
    it('reconhece domínio @lid', () => {
      expect(isOpaqueLidJid('179542585000066@lid')).toBe(true);
    });

    it('não marca @s.whatsapp.net/@c.us como @lid', () => {
      expect(isOpaqueLidJid('5512999999999@s.whatsapp.net')).toBe(false);
      expect(isOpaqueLidJid('5512999999999@c.us')).toBe(false);
    });

    it('falso para JID ausente', () => {
      expect(isOpaqueLidJid(undefined)).toBe(false);
      expect(isOpaqueLidJid(null)).toBe(false);
    });
  });
});
