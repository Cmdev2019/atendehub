import { Role } from '../../generated/prisma/client';
import { UserController } from './user.controller';
import { AuthUserDto } from '../auth/dto/auth-response.dto';

// B-51: a regra "só o próprio usuário" vive no UserService (testada em
// user.service.spec.ts) — aqui o que importa é o controller repassar o id do
// TOKEN como requisitante (nunca um valor vindo da requisição) e a rota ter
// limite próprio, mais apertado que o genérico da API.
describe('UserController — troca de senha (B-51)', () => {
  const mockUserService = { changePassword: jest.fn() };
  const controller = new UserController(mockUserService as any);

  const user: AuthUserDto = {
    id: 'user-a',
    companyId: 'company-a',
    name: 'Agente',
    email: 'agente@empresa.com',
    role: Role.AGENT,
    avatarUrl: null,
  };
  const dto = { currentPassword: 'SenhaAtual1', newPassword: 'SenhaNova2' };

  beforeEach(() => jest.clearAllMocks());

  it('repassa o id do usuário do token como requisitante, e a sessão dele (B-74)', () => {
    controller.changePassword({ ...user, sessionId: 'sessao-1' }, 'qualquer-id', dto);

    expect(mockUserService.changePassword).toHaveBeenCalledWith(
      'company-a',
      'qualquer-id',
      dto,
      'user-a',
      'sessao-1',
    );
  });

  // B-65 (ADR-0019): o estado é sempre o do dono do token — a rota não tem :id
  it('troca o estado do usuário do token, nunca de outro', () => {
    const service = { updateOwnAvailability: jest.fn() };
    new UserController(service as any).updateOwnAvailability(user, { availability: 'ONLINE' as any });

    expect(service.updateOwnAvailability).toHaveBeenCalledWith('company-a', 'user-a', 'ONLINE');
  });

  it('aplica limite próprio de 5 tentativas por minuto na rota', () => {
    // Mesmas chaves que o decorator @Throttle grava (THROTTLER:LIMIT/TTL +
    // nome do throttler) — o @nestjs/throttler não exporta essas constantes.
    const handler = UserController.prototype.changePassword;

    expect(Reflect.getMetadata('THROTTLER:LIMITdefault', handler)).toBe(5);
    expect(Reflect.getMetadata('THROTTLER:TTLdefault', handler)).toBe(60_000);
  });
});
