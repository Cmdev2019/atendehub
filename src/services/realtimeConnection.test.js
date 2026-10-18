import {
  closedByServer,
  createSessionRenewer,
  createStatusStore,
  isHandshakeAuthError,
} from './realtimeConnection';

describe('realtimeConnection (B-74)', () => {
  describe('isHandshakeAuthError', () => {
    it('reconhece o código enviado pelo servidor', () => {
      expect(isHandshakeAuthError({ message: 'Sessão encerrada', data: { code: 'UNAUTHORIZED' } })).toBe(true);
    });

    it('reconhece mensagens de token sem código (servidor antigo)', () => {
      expect(isHandshakeAuthError({ message: 'Token inválido ou expirado' })).toBe(true);
    });

    it('não confunde falha de rede com autenticação', () => {
      expect(isHandshakeAuthError({ message: 'xhr poll error' })).toBe(false);
      expect(isHandshakeAuthError(undefined)).toBe(false);
    });
  });

  it('closedByServer só para desconexão feita pelo servidor', () => {
    expect(closedByServer('io server disconnect')).toBe(true);
    expect(closedByServer('transport close')).toBe(false);
    expect(closedByServer('io client disconnect')).toBe(false);
  });

  describe('createSessionRenewer', () => {
    const setup = (refresh) => {
      const deps = {
        refresh: jest.fn(refresh),
        reconnect: jest.fn(),
        endSession: jest.fn(),
        retryLater: jest.fn(),
      };
      return { deps, renew: createSessionRenewer(deps) };
    };

    it('renovou: reconecta', async () => {
      const { deps, renew } = setup(async () => true);
      await renew();
      expect(deps.reconnect).toHaveBeenCalledTimes(1);
      expect(deps.endSession).not.toHaveBeenCalled();
    });

    it('servidor recusou a renovação: encerra a sessão em vez de tentar para sempre', async () => {
      const { deps, renew } = setup(async () => false);
      await renew();
      expect(deps.endSession).toHaveBeenCalledTimes(1);
      expect(deps.reconnect).not.toHaveBeenCalled();
    });

    it('erro de rede: tenta mais tarde, sem deslogar', async () => {
      const { deps, renew } = setup(async () => {
        throw new Error('Failed to fetch');
      });
      await renew();
      expect(deps.retryLater).toHaveBeenCalledTimes(1);
      expect(deps.endSession).not.toHaveBeenCalled();
    });

    it('chamadas simultâneas compartilham uma renovação só', async () => {
      let resolve;
      const { deps, renew } = setup(() => new Promise((r) => { resolve = r; }));
      const a = renew();
      const b = renew();
      resolve(true);
      await Promise.all([a, b]);
      expect(deps.refresh).toHaveBeenCalledTimes(1);
      expect(deps.reconnect).toHaveBeenCalledTimes(1);
    });
  });

  it('createStatusStore notifica só quando o estado muda', () => {
    const store = createStatusStore();
    const cb = jest.fn();
    const unsubscribe = store.subscribe(cb);

    store.set('connected');
    store.set('connected');
    store.set('reconnecting');
    unsubscribe();
    store.set('connected');

    expect(cb.mock.calls).toEqual([['connected'], ['reconnecting']]);
    expect(store.get()).toBe('connected');
  });
});
