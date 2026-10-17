import { createTokenRefresher, shouldRefreshOn401 } from './sessionRefresh';

// Storage em memória — independente do mock global de localStorage do
// jest.setup.js, para conferir exatamente o que ficou gravado.
function memoryStorage(initial = {}) {
  const data = { ...initial };
  return {
    data,
    getItem: (key) => (key in data ? data[key] : null),
    setItem: (key, value) => {
      data[key] = String(value);
    },
  };
}

describe('createTokenRefresher (B-53)', () => {
  it('guarda o access token novo e o refresh token rotacionado', async () => {
    const storage = memoryStorage({ refreshToken: 'rt-1' });
    const refreshRequest = jest.fn().mockResolvedValue({ accessToken: 'at-2', refreshToken: 'rt-2' });
    const refresh = createTokenRefresher({ storage, refreshRequest });

    await expect(refresh()).resolves.toBe('at-2');
    expect(refreshRequest).toHaveBeenCalledWith('rt-1');
    expect(storage.data).toEqual({ refreshToken: 'rt-2', accessToken: 'at-2' });
  });

  // Regressão do logout a cada ~30 min: a 2ª renovação reenviava o refresh
  // token antigo, que o backend já tinha revogado na rotação.
  it('a renovação seguinte envia o refresh token novo', async () => {
    const storage = memoryStorage({ refreshToken: 'rt-1' });
    const refreshRequest = jest
      .fn()
      .mockResolvedValueOnce({ accessToken: 'at-2', refreshToken: 'rt-2' })
      .mockResolvedValueOnce({ accessToken: 'at-3', refreshToken: 'rt-3' });
    const refresh = createTokenRefresher({ storage, refreshRequest });

    await refresh();
    await refresh();

    expect(refreshRequest).toHaveBeenNthCalledWith(2, 'rt-2');
    expect(storage.data.refreshToken).toBe('rt-3');
  });

  it('chamadas simultâneas compartilham uma única renovação', async () => {
    const storage = memoryStorage({ refreshToken: 'rt-1' });
    let respond;
    const refreshRequest = jest.fn(
      () =>
        new Promise((resolve) => {
          respond = resolve;
        }),
    );
    const refresh = createTokenRefresher({ storage, refreshRequest });

    const calls = [refresh(), refresh(), refresh()];
    respond({ accessToken: 'at-2', refreshToken: 'rt-2' });

    await expect(Promise.all(calls)).resolves.toEqual(['at-2', 'at-2', 'at-2']);
    expect(refreshRequest).toHaveBeenCalledTimes(1);
  });

  it('aceita resposta sem refresh token novo (modo demonstração) sem apagar o atual', async () => {
    const storage = memoryStorage({ refreshToken: 'rt-1' });
    const refresh = createTokenRefresher({
      storage,
      refreshRequest: jest.fn().mockResolvedValue({ accessToken: 'at-2' }),
    });

    await expect(refresh()).resolves.toBe('at-2');
    expect(storage.data).toEqual({ refreshToken: 'rt-1', accessToken: 'at-2' });
  });

  it('sem refresh token salvo, não chama o servidor e devolve null', async () => {
    const refreshRequest = jest.fn();
    const refresh = createTokenRefresher({ storage: memoryStorage(), refreshRequest });

    await expect(refresh()).resolves.toBeNull();
    expect(refreshRequest).not.toHaveBeenCalled();
  });

  it('servidor recusa (sessão encerrada): devolve null e não mexe no storage', async () => {
    const storage = memoryStorage({ refreshToken: 'rt-revogado' });
    const refresh = createTokenRefresher({ storage, refreshRequest: jest.fn().mockResolvedValue(null) });

    await expect(refresh()).resolves.toBeNull();
    expect(storage.data).toEqual({ refreshToken: 'rt-revogado' });
  });

  it('erro de rede é propagado e não trava as renovações seguintes', async () => {
    const storage = memoryStorage({ refreshToken: 'rt-1' });
    const refreshRequest = jest
      .fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce({ accessToken: 'at-2', refreshToken: 'rt-2' });
    const refresh = createTokenRefresher({ storage, refreshRequest });

    await expect(refresh()).rejects.toThrow(TypeError);
    await expect(refresh()).resolves.toBe('at-2');
  });
});

describe('shouldRefreshOn401 (B-53)', () => {
  it.each(['/auth/login', '/auth/register-company', '/auth/refresh'])(
    'não renova em 401 de %s (credencial inválida, não sessão expirada)',
    (endpoint) => {
      expect(shouldRefreshOn401(endpoint)).toBe(false);
    },
  );

  it.each(['/auth/me', '/auth/logout', '/conversations?page=1&limit=20', '/users/u-1/password'])(
    'renova em 401 de %s',
    (endpoint) => {
      expect(shouldRefreshOn401(endpoint)).toBe(true);
    },
  );
});
