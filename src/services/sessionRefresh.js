// Renovação de sessão (B-53) — separada de api.js, que depende de
// import.meta.env e não roda no Jest, para poder ser testada isoladamente.

// Rotas em que 401 significa credencial inválida (senha errada, refresh token
// revogado), não sessão expirada: tentar renovar ali só mascarava o erro real —
// senha errada no login aparecia como "Sessão expirada".
const CREDENTIAL_ENDPOINTS = ['/auth/login', '/auth/register-company', '/auth/refresh'];

export function shouldRefreshOn401(endpoint) {
  const path = endpoint.split('?')[0];
  return !CREDENTIAL_ENDPOINTS.includes(path);
}

// Devolve uma função `refresh()` que renova o access token:
// - resolve com o access token novo quando a renovação funciona;
// - resolve com null quando a sessão acabou (sem refresh token salvo, ou o
//   servidor recusou) — quem chama decide encerrar a sessão;
// - rejeita em erro de rede, para não confundir servidor fora do ar com
//   sessão expirada.
//
// `refreshRequest(refreshToken)` faz a chamada ao backend e resolve com o
// corpo da resposta ({ accessToken, refreshToken }) ou null se recusada.
export function createTokenRefresher({ storage, refreshRequest }) {
  let inFlight = null;

  async function doRefresh() {
    const refreshToken = storage.getItem('refreshToken');
    if (!refreshToken) return null;

    const response = await refreshRequest(refreshToken);
    if (!response?.accessToken) return null;

    storage.setItem('accessToken', response.accessToken);
    // O backend rotaciona o refresh token a cada renovação e revoga o
    // anterior — sem guardar o novo, a renovação seguinte era recusada e o
    // usuário saía do sistema (~2 × JWT_EXPIRES_IN depois do login).
    if (response.refreshToken) {
      storage.setItem('refreshToken', response.refreshToken);
    }
    return response.accessToken;
  }

  // Uma renovação por vez: várias requisições que recebem 401 juntas (e o
  // WebSocket reconectando) esperam a mesma promessa, em vez de cada uma
  // gastar o refresh token — que só vale uma vez por causa da rotação.
  return function refresh() {
    if (!inFlight) {
      inFlight = doRefresh().finally(() => {
        inFlight = null;
      });
    }
    return inFlight;
  };
}
