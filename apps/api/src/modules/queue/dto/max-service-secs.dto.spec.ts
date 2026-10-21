import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateQueueDto } from './create-queue.dto';
import { UpdateQueueDto } from './update-queue.dto';

// B-114 (ADR-0019, regra 19): prazo do atendimento por setor — um inteiro
// positivo de segundos, ou null para o setor ficar sem SLA do atendimento
describe('Prazo do atendimento da fila (maxServiceSecs)', () => {
  it.each([
    ['CreateQueueDto', CreateQueueDto, { name: 'Fila Receitas' }],
    ['UpdateQueueDto', UpdateQueueDto, {}],
  ])('%s aceita segundos, null ou nada; recusa zero, fração e texto', async (_name, Dto, base) => {
    const errorsFor = async (value?: unknown) =>
      validate(plainToInstance(Dto as any, { ...base, ...(value !== undefined && { maxServiceSecs: value }) }) as object);

    expect(await errorsFor(1800)).toHaveLength(0);
    expect(await errorsFor(null)).toHaveLength(0);
    expect(await errorsFor()).toHaveLength(0);
    expect(await errorsFor(0)).toHaveLength(1);
    expect(await errorsFor(1.5)).toHaveLength(1);
    expect(await errorsFor('600')).toHaveLength(1);
  });
});
