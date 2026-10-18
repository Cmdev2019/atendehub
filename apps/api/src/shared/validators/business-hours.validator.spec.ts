import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { VALIDATION_PIPE_OPTIONS } from '../http/http-pipeline';
import { UpdateAutoAttendanceFlowDto } from '../../modules/auto-attendance/dto/update-auto-attendance-flow.dto';
import { isValidBusinessHours } from './business-hours.validator';

// B-99 (L-11): businessHours malformado desligava o auto-atendimento sem aviso
describe('businessHours (B-99)', () => {
  it('aceita o formato do painel, inclusive vários intervalos e dias ausentes', () => {
    expect(isValidBusinessHours({ mon: [{ start: '09:00', end: '12:00' }, { start: '13:00', end: '18:00' }] })).toBe(true);
    expect(isValidBusinessHours({})).toBe(true); // tudo fechado
  });

  it.each([
    ['dia com nome errado', { segunda: [{ start: '09:00', end: '18:00' }] }],
    ['hora fora do formato', { mon: [{ start: '9h', end: '18:00' }] }],
    ['início depois do fim', { mon: [{ start: '18:00', end: '09:00' }] }],
    ['intervalos que não são lista', { mon: { start: '09:00', end: '18:00' } }],
    ['lista em vez de objeto', [{ start: '09:00', end: '18:00' }]],
  ])('recusa %s', (_label, value) => {
    expect(isValidBusinessHours(value)).toBe(false);
  });

  it('o DTO do fluxo responde 400 para businessHours inválido', async () => {
    const pipe = new ValidationPipe(VALIDATION_PIPE_OPTIONS);
    await expect(
      pipe.transform({ businessHours: { mon: [{ start: '9h', end: '18h' }] } }, { type: 'body', metatype: UpdateAutoAttendanceFlowDto }),
    ).rejects.toThrow(BadRequestException);
  });
});
