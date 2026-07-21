// services/api usa import.meta.env (Vite) — precisa ser mockado antes do
// hook ser importado, senão o Jest (CommonJS) falha ao parsear o módulo.
jest.mock('../services/api', () => ({
  apiClient: { getConversations: jest.fn(), getConversation: jest.fn(), getMessages: jest.fn(), sendMessage: jest.fn() },
}));
jest.mock('../services/websocket', () => ({
  wsClient: { on: jest.fn(), off: jest.fn(), joinConversation: jest.fn(), leaveConversation: jest.fn(), isConnected: false },
}));

import { toUiConversation, toUiMessage } from './useConversations';

// F1-6: testes dedicados do adapter/normalizador entre o contrato real da
// API (docs/API_CONTRACT.md) e o shape consumido pelos componentes.
describe('toUiMessage', () => {
  it('converte mensagem do contrato da API para o shape da UI', () => {
    const apiMessage = {
      id: 'msg-1',
      senderType: 'CLIENT',
      content: 'Olá',
      type: 'TEXT',
      status: 'DELIVERED',
      sentAt: '2026-07-21T10:12:00.000Z',
      attachments: [],
    };

    const ui = toUiMessage(apiMessage);

    expect(ui.id).toBe('msg-1');
    expect(ui.type).toBe('customer');
    expect(ui.text).toBe('Olá');
    expect(ui.mediaType).toBe('TEXT');
    expect(typeof ui.time).toBe('string');
  });

  it('mapeia senderType AGENT/BOT/SYSTEM para type "agent"', () => {
    expect(toUiMessage({ senderType: 'AGENT', content: 'a', sentAt: new Date().toISOString() }).type).toBe('agent');
    expect(toUiMessage({ senderType: 'BOT', content: 'b', sentAt: new Date().toISOString() }).type).toBe('agent');
  });

  it('mapeia anexos preservando url/mimeType/fileName', () => {
    const ui = toUiMessage({
      senderType: 'CLIENT',
      content: null,
      sentAt: new Date().toISOString(),
      attachments: [{ id: 'att-1', url: 'http://minio/x.png', mimeType: 'image/png', fileName: 'x.png' }],
    });

    expect(ui.attachments).toEqual([
      { id: 'att-1', url: 'http://minio/x.png', mimeType: 'image/png', fileName: 'x.png' },
    ]);
  });

  it('já no shape da UI (tem .text) passa direto sem transformar', () => {
    const uiMessage = { id: 'm1', type: 'customer', text: 'oi', time: '10:00' };
    expect(toUiMessage(uiMessage)).toBe(uiMessage);
  });

  it('retorna null para mensagem ausente', () => {
    expect(toUiMessage(null)).toBeNull();
  });
});

describe('toUiConversation', () => {
  const apiConversation = {
    id: 'conv-9',
    status: 'WAITING',
    channel: 'WHATSAPP',
    unreadCount: 2,
    lastMessagePreview: 'última mensagem',
    contact: { id: 'ct-1', name: 'Natanael', phone: '5512999999999', avatarUrl: 'http://x/avatar.png' },
    agent: { id: 'ag-1', name: 'Camila', avatarUrl: null },
    tags: [{ id: 't1', name: 'Prioridade', color: '#ef4444' }],
  };

  it('achata contact/agent/tags do contrato da API para strings simples', () => {
    const ui = toUiConversation(apiConversation);

    expect(ui.contact).toBe('Natanael');
    expect(ui.phone).toBe('5512999999999');
    expect(ui.avatarUrl).toBe('http://x/avatar.png');
    expect(ui.agent).toBe('Camila');
    expect(ui.tags).toEqual(['Prioridade']);
    expect(ui.channel).toBe('WhatsApp');
    expect(ui.summary).toBe('última mensagem');
  });

  it('sem mensagens embutidas (listagem real da API): messagesLoaded fica false', () => {
    const ui = toUiConversation(apiConversation);
    expect(ui.messages).toEqual([]);
    expect(ui.messagesLoaded).toBe(false);
  });

  it('com mensagens embutidas (fixtures de demonstração): normaliza e marca messagesLoaded true', () => {
    const withMessages = {
      ...apiConversation,
      messages: [{ id: 'm1', senderType: 'CLIENT', content: 'oi', sentAt: new Date().toISOString() }],
    };

    const ui = toUiConversation(withMessages);

    expect(ui.messagesLoaded).toBe(true);
    expect(ui.messages).toHaveLength(1);
    expect(ui.messages[0].text).toBe('oi');
  });

  it('contact sem nome usa o telefone como fallback', () => {
    const ui = toUiConversation({ ...apiConversation, contact: { id: 'ct-2', phone: '5511999999999', avatarUrl: null } });
    expect(ui.contact).toBe('5511999999999');
  });

  it('conversa sem agente atribuído mapeia agent para null', () => {
    const ui = toUiConversation({ ...apiConversation, agent: null });
    expect(ui.agent).toBeNull();
  });

  it('mock/testes legados com contact já em string passam direto (sem transformar)', () => {
    const legacy = { id: 'conv-1', contact: 'João', messages: [] };
    expect(toUiConversation(legacy)).toBe(legacy);
  });
});
