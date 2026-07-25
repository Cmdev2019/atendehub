// Pub/sub local mínimo usado pelo WebSocketClient para repassar eventos do
// backend a múltiplos consumidores (hooks/componentes) dentro da app.
// Extraído à parte (B-7) para ficar testável sem depender de import.meta.env
// — o resto de websocket.js usa isso no escopo do módulo, e o Jest não
// consegue importar esse arquivo diretamente (mesma razão pela qual
// api.test.js mocka ./api em vez de importar o real).
export class EventBus {
  constructor() {
    this.listeners = new Map();
  }

  // Ouvir um evento. Devolve uma função de unsubscribe (equivalente a
  // off(event, callback)) para quem preferir esse estilo.
  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);
    return () => this.off(event, callback);
  }

  // Parar de ouvir. Remove só o callback informado — dois consumidores do
  // mesmo evento não se derrubam mais um ao outro ao desmontar (B-7). Sem
  // callback, remove todos os listeners do evento (uso raro, mantido só
  // por compatibilidade).
  off(event, callback) {
    if (!this.listeners.has(event)) return;
    if (!callback) {
      this.listeners.delete(event);
      return;
    }
    const remaining = this.listeners.get(event).filter((cb) => cb !== callback);
    if (remaining.length > 0) {
      this.listeners.set(event, remaining);
    } else {
      this.listeners.delete(event);
    }
  }

  emit(event, data) {
    if (!this.listeners.has(event)) return;
    this.listeners.get(event).forEach((callback) => {
      try {
        callback(data);
      } catch (error) {
        console.error(`❌ Erro em listener de '${event}':`, error);
      }
    });
  }
}
