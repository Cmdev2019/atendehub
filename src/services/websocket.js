import { io } from 'socket.io-client';

const WS_URL = import.meta.env.VITE_WS_URL || 'http://localhost:3001';

export class WebSocketClient {
  constructor() {
    this.socket = null;
    this.listeners = new Map();
    this.isConnected = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
  }

  connect(token) {
    return new Promise((resolve, reject) => {
      try {
        this.socket = io(WS_URL, {
          auth: {
            token: token || localStorage.getItem('accessToken'),
          },
          reconnection: true,
          reconnectionDelay: 1000,
          reconnectionDelayMax: 5000,
          reconnectionAttempts: this.maxReconnectAttempts,
        });

        this.socket.on('connect', () => {
          console.log('✅ WebSocket conectado!');
          this.isConnected = true;
          this.reconnectAttempts = 0;
          resolve();
        });

        this.socket.on('connect_error', (error) => {
          console.error('❌ Erro de conexão WebSocket:', error.message);
          this.isConnected = false;
          
          if (this.reconnectAttempts === 0) {
            reject(error);
          }
          this.reconnectAttempts++;
        });

        this.socket.on('disconnect', () => {
          console.warn('⚠️ WebSocket desconectado');
          this.isConnected = false;
        });

        // Ouvir eventos que chegam do backend
        this.socket.on('message:created', (data) => {
          this.emit('message:created', data);
        });

        this.socket.on('conversation:updated', (data) => {
          this.emit('conversation:updated', data);
        });

        this.socket.on('user:typing', (data) => {
          this.emit('user:typing', data);
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

  // Ouvir evento local
  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);
  }

  // Parar de ouvir evento
  off(event) {
    this.listeners.delete(event);
  }

  // Emitir evento local
  emit(event, data) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).forEach((callback) => {
        try {
          callback(data);
        } catch (error) {
          console.error(`❌ Erro em listener de '${event}':`, error);
        }
      });
    }
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

  // Enviar mensagem (será retransmitida pelo backend)
  sendMessage(conversationId, text) {
    this.send('send:message', {
      conversationId,
      text,
    });
  }

  // Indicar que está digitando
  setTyping(conversationId, isTyping) {
    this.send('user:typing', {
      conversationId,
      isTyping,
    });
  }
}

// Instância global
export const wsClient = new WebSocketClient();
