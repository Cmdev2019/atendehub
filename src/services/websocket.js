import { io } from 'socket.io-client';
import { apiClient } from './api';
import { EventBus } from './eventBus';

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
    this.maxReconnectAttempts = 5;
    this.refreshingToken = false;
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
          reconnectionDelayMax: 5000,
          reconnectionAttempts: this.maxReconnectAttempts,
        });

        this.socket.on('connect', () => {
          console.log('✅ WebSocket conectado!');
          this.isConnected = true;
          this.reconnectAttempts = 0;
          this.refreshingToken = false;
          resolve();
        });

        this.socket.on('connect_error', async (error) => {
          console.error('❌ Erro de conexão WebSocket:', error.message);
          this.isConnected = false;

          if (this.reconnectAttempts === 0) {
            reject(error);
          }
          this.reconnectAttempts++;

          // Handshake rejeitado por token ("Token não informado" / "Token
          // inválido ou expirado"): renova via REST e reconecta com o novo
          if (/token/i.test(error.message || '') && !this.refreshingToken) {
            this.refreshingToken = true;
            const refreshed = await apiClient.refreshToken();
            this.refreshingToken = false;
            if (refreshed && this.socket) {
              this.socket.connect();
            }
          }
        });

        this.socket.on('disconnect', () => {
          console.warn('⚠️ WebSocket desconectado');
          this.isConnected = false;
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
      console.log('⏸️ WebSocket desconectado gracefully');
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
    console.log(`📍 Entrando na conversa: ${conversationId}`);
  }

  // Sair de uma sala de conversa
  leaveConversation(conversationId) {
    this.send('leave:conversation', { conversationId });
    console.log(`📍 Saindo da conversa: ${conversationId}`);
  }
}

// Instância global
export const wsClient = new WebSocketClient();
