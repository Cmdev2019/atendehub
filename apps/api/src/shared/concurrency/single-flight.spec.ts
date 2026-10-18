import { SingleFlight } from './single-flight';

describe('SingleFlight (B-84)', () => {
  it('chamadas simultâneas com a mesma chave dividem uma execução', async () => {
    const flight = new SingleFlight<number>();
    let calls = 0;
    let release!: (v: number) => void;
    const compute = () => {
      calls++;
      return new Promise<number>((r) => (release = r));
    };

    const a = flight.run('k', compute);
    const b = flight.run('k', compute);
    release(42);

    await expect(Promise.all([a, b])).resolves.toEqual([42, 42]);
    expect(calls).toBe(1);
  });

  it('depois de terminar, calcula de novo (nunca devolve resultado velho)', async () => {
    const flight = new SingleFlight<number>();
    let n = 0;
    await flight.run('k', async () => ++n);
    await expect(flight.run('k', async () => ++n)).resolves.toBe(2);
  });

  it('chaves diferentes não se misturam; erro libera a chave', async () => {
    const flight = new SingleFlight<string>();
    await expect(flight.run('a', async () => { throw new Error('falhou'); })).rejects.toThrow('falhou');
    await expect(flight.run('a', async () => 'ok')).resolves.toBe('ok');
    await expect(flight.run('b', async () => 'outro')).resolves.toBe('outro');
  });
});
