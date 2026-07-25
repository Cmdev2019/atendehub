// Regressão de B-7: wsClient.off(event) removia TODOS os listeners daquele
// evento, não só o do chamador — dois componentes ouvindo o mesmo evento
// corriam risco de um apagar o listener do outro ao desmontar.
import { EventBus } from './eventBus';

describe('EventBus (pub/sub local usado pelo WebSocketClient)', () => {
  let bus;

  beforeEach(() => {
    bus = new EventBus();
  });

  it('emit chama o callback registrado com on()', () => {
    const cb = jest.fn();
    bus.on('conversation.updated', cb);

    bus.emit('conversation.updated', { conversationId: '1' });

    expect(cb).toHaveBeenCalledWith({ conversationId: '1' });
  });

  it('off(event, callback) remove só o callback informado, preservando outros ouvintes do mesmo evento', () => {
    const cbA = jest.fn();
    const cbB = jest.fn();
    bus.on('sla.breached', cbA);
    bus.on('sla.breached', cbB);

    bus.off('sla.breached', cbA);
    bus.emit('sla.breached', { conversationId: '1' });

    expect(cbA).not.toHaveBeenCalled();
    expect(cbB).toHaveBeenCalledTimes(1);
  });

  it('a função de unsubscribe devolvida por on() remove só aquele callback', () => {
    const cbA = jest.fn();
    const cbB = jest.fn();
    const unsubscribeA = bus.on('conversation.assigned', cbA);
    bus.on('conversation.assigned', cbB);

    unsubscribeA();
    bus.emit('conversation.assigned', {});

    expect(cbA).not.toHaveBeenCalled();
    expect(cbB).toHaveBeenCalledTimes(1);
  });

  it('off(event) sem callback continua removendo todos os listeners (compatibilidade)', () => {
    const cbA = jest.fn();
    const cbB = jest.fn();
    bus.on('message.new', cbA);
    bus.on('message.new', cbB);

    bus.off('message.new');
    bus.emit('message.new', {});

    expect(cbA).not.toHaveBeenCalled();
    expect(cbB).not.toHaveBeenCalled();
  });

  it('off com um callback nunca registrado não afeta os listeners existentes', () => {
    const cbA = jest.fn();
    bus.on('message.new', cbA);

    bus.off('message.new', jest.fn());
    bus.emit('message.new', {});

    expect(cbA).toHaveBeenCalledTimes(1);
  });

  it('erro lançado por um listener não impede os demais de rodar', () => {
    const cbThrows = jest.fn(() => {
      throw new Error('boom');
    });
    const cbOk = jest.fn();
    bus.on('message.new', cbThrows);
    bus.on('message.new', cbOk);

    expect(() => bus.emit('message.new', {})).not.toThrow();
    expect(cbOk).toHaveBeenCalledTimes(1);
  });

  it('emit em evento sem nenhum listener não lança erro', () => {
    expect(() => bus.emit('evento.inexistente', {})).not.toThrow();
  });
});
