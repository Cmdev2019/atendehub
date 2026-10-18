import { ValidationPipe, ArgumentMetadata } from '@nestjs/common';
import { VALIDATION_PIPE_OPTIONS } from '../../../shared/http/http-pipeline';
import { ListUsersDto } from './list-users.dto';
import { ListContactsDto } from '../../contact/dto/list-contacts.dto';
import { ListNotificationsDto } from '../../notification/dto/list-notifications.dto';

// B-69 (M-14): os filtros booleanos vêm da query string, sempre como texto.
// Com `enableImplicitConversion` e `@Type(() => Boolean)`, qualquer texto não
// vazio virava `true` — inclusive `"false"`, porque `Boolean("false")` é
// `true`. Resultado: `?isActive=false` filtrava os ATIVOS, o inverso do
// pedido. A correção desliga a conversão implícita no pipeline e deixa cada
// DTO declarar a própria conversão (`@Transform(value === 'true')`). Este
// teste usa as MESMAS opções do ValidationPipe de produção
// (VALIDATION_PIPE_OPTIONS), então falha se alguém religar a conversão
// implícita ou trocar a conversão de um dos DTOs.
describe('Filtros booleanos das listagens (B-69 / M-14)', () => {
  const pipe = new ValidationPipe(VALIDATION_PIPE_OPTIONS);

  const meta = (metatype: any): ArgumentMetadata => ({
    type: 'query',
    metatype,
    data: '',
  });

  const cases: Array<[string, any, string]> = [
    ['ListUsersDto', ListUsersDto, 'isActive'],
    ['ListContactsDto', ListContactsDto, 'isBlocked'],
    ['ListNotificationsDto', ListNotificationsDto, 'unreadOnly'],
  ];

  describe.each(cases)('%s.%s', (_name, Dto, field) => {
    it('"false" (string da query) vira false, não true', async () => {
      const out = await pipe.transform({ [field]: 'false' }, meta(Dto));
      expect(out[field]).toBe(false);
    });

    it('"true" vira true', async () => {
      const out = await pipe.transform({ [field]: 'true' }, meta(Dto));
      expect(out[field]).toBe(true);
    });

    it('ausente continua undefined (sem filtro)', async () => {
      const out = await pipe.transform({}, meta(Dto));
      expect(out[field]).toBeUndefined();
    });
  });
});
