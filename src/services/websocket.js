import { io } from 'socket.io-client';
import { apiClient } from './api';
import { EventBus } from './eventBus';
import {
  closedByServer,
  createSessionRenewer,
  createStatusStore,
  isHandshakeAuthError,
} from './realtimeConnection';

// Nova tentativa depois de erro de rede ao renovar o token (B-74)
const RENEW_RETRY_MS = 5000;

const WS_BASE_URL = import.meta.env.VITE_WS_URL || 'http://localhost:3001';

// O gateway NestJS escuta no namespace /ws (events.gateway.ts). Aceita a URL
// base com ou sem /ws no final para tolerar variações de configuração.
const WS_URL = `${WS_BASE_URL.replace(/\/(ws\/?)?$/, '')}/ws`;

// Eventos emitidos pelo backend (nomes conforme events.service.ts / gateway)
const BACKEND_EVENTS = [
  'connected',
  'message.new',
  'message.updated',
  'message.status',
  'conversation.created',
  'conversation.updated',
  'conversation.assigned',
  'connection.status',
  'sla.breached',
];

export class WebSocketClient {
  constructor() {
    this.socket = null;
    this.bus = new EventBus();
    this.isConnected = false;
    this.reconnectAttempts = 0;
    // Estado para a UI (banner de reconexão) — B-74
    this.status = createStatusStore();
    this.hasConnectedBefore = false;

    // B-74 (M-09): handshake recusado ou socket derrubado pelo servidor →
    // renova o token via REST. Se o servidor recusar a renovação (logout,
    // senha trocada, usuário desativado), a sessão acabou de verdade e o app
    // volta ao login — antes ficava tentando com um token morto.
    this.renewSession = createSessionRenewer({
      refresh: () => apiClient.refreshToken(),
      reconnect: () => this.socket?.connect(),
      endSession: () => apiClient.notifySessionExpired(),
      retryLater: () => setTimeout(() => this.socket?.connect(), RENEW_RETRY_MS),
    });

    // Assinatura no formato do useSyncExternalStore (funções já ligadas)
    this.onStatusChange = (callback) => this.status.subscribe(callback);
    this.getStatus = () => this.status.get();
  }

  connect(token) {
    return new Promise((resolve, reject) => {
      try {
        this.socket = io(WS_URL, {
          // auth como função: avaliada a CADA tentativa de (re)conexão, então
          // reconexões sempre usam o accessToken atual (não o do 1º connect)
          auth: (cb) => cb({
            token: localStorage.getItem('accessToken') || token,
          }),
          reconnection: true,
          reconnectionDelay: 1000,
          reconnectionDelayMax: 10000,
          // B-74 (M-09): sem limite — antes desistia após 5 tentativas, em
          // silêncio, e o painel parava de receber mensagens até um F5.
          reconnectionAttempts: Infinity,
        });

        this.socket.on('connect', () => {
          this.isConnected = true;
          this.reconnectAttempts = 0;
          this.status.set('connected');
          // Eventos perdidos enquanto o socket esteve fora não voltam —
          // quem mostra listas recarrega ao ouvir 'reconnected'.
          if (this.hasConnectedBefore) this.emit('reconnected');
          this.hasConnectedBefore = true;
          resolve();
        });

        this.socket.on('connect_error', (error) => {
          console.error('❌ Erro de conexão WebSocket:', error.message);
          this.isConnected = false;

          if (this.reconnectAttempts === 0 && !this.hasConnectedBefore) {
            reject(error);
          }
          this.reconnectAttempts++;
          if (this.hasConnectedBefore) this.status.set('reconnecting');

          // Recusa do handshake desliga a reconexão automática do Socket.IO —
          // só volta se renovarmos o token.
          if (isHandshakeAuthError(error)) this.renewSession();
        });

        this.socket.on('disconnect', (reason) => {
          console.warn('⚠️ WebSocket desconectado:', reason);
          this.isConnected = false;
          if (reason === 'io client disconnect') return; // disconnect() nosso

          this.status.set('reconnecting');
          if (closedByServer(reason)) this.renewSession();
        });

        // Repassa os eventos do backend para os listeners locais
        BACKEND_EVENTS.forEach((event) => {
          this.socket.on(event, (data) => {
            this.emit(event, data);
          });
        });

        this.socket.on('error', (error) => {
          console.error('❌ Erro WebSocket:', error);
        });
      } catch (error) {
        console.error('❌ Erro ao conectar WebSocket:', error);
        reject(error);
      }
    });
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.isConnected = false;
      this.hasConnectedBefore = false;
      this.status.set('idle');
    }
  }

  // Ouvir evento local. Devolve uma função de unsubscribe (equivalente a
  // off(event, callback)) para quem preferir esse estilo em vez de guardar
  // a referência do callback à parte. Implementação real em EventBus (B-7).
  on(event, callback) {
    return this.bus.on(event, callback);
  }

  // Parar de ouvir evento. Remove só o callback informado — dois
  // componentes ouvindo o mesmo evento não se derrubam mais ao desmontar
  // (B-7). Sem callback, remove todos os listeners do evento (uso raro,
  // mantido só por compatibilidade).
  off(event, callback) {
    this.bus.off(event, callback);
  }

  // Emitir evento local
  emit(event, data) {
    this.bus.emit(event, data);
  }

  // Enviar evento para backend
  send(event, data) {
    if (!this.isConnected) {
      console.error('❌ WebSocket não conectado');
      return;
    }
    this.socket.emit(event, data);
  }

  // Entrar em uma sala de conversa
  joinConversation(conversationId) {
    this.send('join:conversation', { conversationId });
  }

  // Sair de uma sala de conversa
  leaveConversation(conversationId) {
    this.send('leave:conversation', { conversationId });
  }
}

// Instância global
export const wsClient = new WebSocketClient();
