import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { VALIDATION_PIPE_OPTIONS } from '../http/http-pipeline';
import { CreateUserDto } from '../../modules/user/dto/create-user.dto';
import { LocalStrategy } from '../../modules/auth/strategies/local.strategy';

// B-96 (L-07): limites da autenticação
describe('Robustez da autenticação (B-96)', () => {
  const pipe = new ValidationPipe(VALIDATION_PIPE_OPTIONS);
  const createUser = (password: string) =>
    pipe.transform(
      { name: 'Ana', email: 'ana@empresa.com', password },
      { type: 'body', metatype: CreateUserDto },
    );

  it('aceita senha de até 72 bytes', async () => {
    await expect(createUser('Aa1' + 'x'.repeat(69))).resolves.toBeDefined();
  });

  it('recusa senha acima de 72 bytes, contando acento como 2 bytes', async () => {
    await expect(createUser('Aa1' + 'x'.repeat(70))).rejects.toThrow(BadRequestException);
    // 40 caracteres, mas 77 bytes
    await expect(createUser('Aa1' + 'é'.repeat(37))).rejects.toThrow(BadRequestException);
  });

  describe('LocalStrategy', () => {
    const auth = { validateUser: jest.fn() };
    const strategy = new LocalStrategy(auth as any);

    it.each([
      ['e-mail número', 123, 'Senha123'],
      ['e-mail objeto', { $ne: '' }, 'Senha123'],
      ['senha objeto', 'a@b.com', { x: 1 }],
      ['senha gigante', 'a@b.com', 'x'.repeat(300)],
    ])('%s → 400 sem consultar o banco', async (_label, email, password) => {
      await expect(strategy.validate(email, password)).rejects.toThrow(BadRequestException);
      expect(auth.validateUser).not.toHaveBeenCalled();
    });
  });
});
