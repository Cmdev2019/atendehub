import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-local';
import { AuthService } from '../auth.service';

@Injectable()
export class LocalStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly authService: AuthService) {
    super({ usernameField: 'email' }); // usa email no lugar de username
  }

  async validate(email: string, password: string) {
    const user = await this.authService.validateUser(email, password);

    if (!user) {
      // Mensagem única e genérica para todos os modos de falha (usuário
      // inexistente, inativo ou senha errada) — evita enumeração de contas.
      throw new UnauthorizedException('Usuário ou senha incorreta.');
    }

    return user;
  }
}
