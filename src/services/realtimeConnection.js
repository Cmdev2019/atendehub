// Regras de reconexão do WebSocket (B-74) — separadas de websocket.js, que
// depende de api.js (import.meta.env) e não roda no Jest, para poderem ser
// testadas isoladamente. Mesmo motivo do sessionRefresh.js (B-53).

// Handshake recusado por autenticação: o servidor manda `data.code`; o teste
// pela mensagem cobre servidores anteriores ao B-74.
export function isHandshakeAuthError(error) {
  return error?.data?.code === 'UNAUTHORIZED' || /token/i.test(error?.message || '');
}

// 'io server disconnect': o servidor derrubou o socket (token do handshake
// expirou, logout, sessão encerrada). Nesse caso o Socket.IO não tenta
// reconectar sozinho — quem decide é o renovador abaixo.
export function closedByServer(reason) {
  return reason === 'io server disconnect';
}

// Renova o access token via REST e decide o próximo passo:
// - renovou → reconecta com o token novo;
// - servidor recusou (sessão acabou: logout, senha trocada, usuário
//   desativado) → encerra a sessão no app;
// - erro de rede → tenta de novo mais tarde (servidor fora do ar não é motivo
//   para deslogar).
// Uma renovação por vez: vários connect_error seguidos esperam a mesma.
export function createSessionRenewer({ refresh, reconnect, endSession, retryLater }) {
  let inFlight = null;

  return function renew() {
    if (!inFlight) {
      inFlight = (async () => {
        try {
          if (await refresh()) reconnect();
          else endSession();
        } catch {
          retryLater();
        }
      })().finally(() => {
        inFlight = null;
      });
    }
    return inFlight;
  };
}

// Estado da conexão para a UI: 'idle' (sem sessão ou desconectado de
// propósito), 'connected' ou 'reconnecting'.
export function createStatusStore(initial = 'idle') {
  let status = initial;
  const listeners = new Set();

  return {
    get: () => status,
    set(next) {
      if (next === status) return;
      status = next;
      listeners.forEach((cb) => cb(next));
    },
    subscribe(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
  };
}
