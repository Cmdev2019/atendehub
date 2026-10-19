import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateQueueDto } from './create-queue.dto';
import { UpdateQueueDto } from './update-queue.dto';

// B-66 (ADR-0019, M-21): a fila é compartilhada — ROUND_ROBIN e LEAST_BUSY
// eram gravadas e nunca aplicadas; agora a API recusa
describe('Estratégia da fila: só MANUAL', () => {
  it.each([
    ['CreateQueueDto', CreateQueueDto, { name: 'Fila Receitas' }],
    ['UpdateQueueDto', UpdateQueueDto, {}],
  ])('%s recusa ROUND_ROBIN e LEAST_BUSY, aceita MANUAL ou nada', async (_name, Dto, base) => {
    const errorsFor = async (strategy?: string) =>
      validate(plainToInstance(Dto as any, { ...base, ...(strategy && { strategy }) }) as object);

    expect(await errorsFor('ROUND_ROBIN')).toHaveLength(1);
    expect(await errorsFor('LEAST_BUSY')).toHaveLength(1);
    expect(await errorsFor('MANUAL')).toHaveLength(0);
    expect(await errorsFor()).toHaveLength(0);
  });
});
