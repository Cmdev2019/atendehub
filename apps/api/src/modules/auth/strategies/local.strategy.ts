import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-local';
import { AuthService } from '../auth.service';

@Injectable()
export class LocalStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly authService: AuthService) {
    super({ usernameField: 'email' }); // usa email no lugar de username
  }

  async validate(email: unknown, password: unknown) {
    // B-96 (L-07): o guard do login roda antes do ValidationPipe — sem esta
    // checagem, um e-mail que não fosse texto (número, objeto) virava 500 no
    // toLowerCase(). Senha acima de 256 caracteres nem chega ao bcrypt.
    if (typeof email !== 'string' || typeof password !== 'string' || email.length > 254 || password.length > 256) {
      throw new BadRequestException('E-mail e senha devem ser texto');
    }

    const user = await this.authService.validateUser(email, password);

    if (!user) {
      // Mensagem única e genérica para todos os modos de falha (usuário
      // inexistente, inativo ou senha errada) — evita enumeração de contas.
      throw new UnauthorizedException('Usuário ou senha incorreta.');
    }

    return user;
  }
}
