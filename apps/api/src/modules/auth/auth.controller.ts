import {
  Controller,
  Post,
  Get,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
  UnauthorizedException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { LocalAuthGuard } from './guards/local-auth.guard';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { Public } from './decorators/public.decorator';
import { CurrentUser } from './decorators/current-user.decorator';
import { AccessToken } from './decorators/access-token.decorator';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { AuthResponseDto, AuthUserDto } from './dto/auth-response.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // POST /api/v1/auth/login
  // Limite dedicado e restrito: protege contra força bruta de senha,
  // independente do limite geral (100 req/min) aplicado ao resto da API.
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Public()
  @UseGuards(LocalAuthGuard)
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() _dto: LoginDto,           // validação do body
    @CurrentUser() user: AuthUserDto, // usuário já validado pelo LocalStrategy
  ): Promise<AuthResponseDto> {
    return this.authService.login(user);
  }

  // POST /api/v1/auth/refresh
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Body() dto: RefreshTokenDto): Promise<AuthResponseDto> {
    return this.authService.refresh(dto.refreshToken);
  }

  // POST /api/v1/auth/logout
  @UseGuards(JwtAuthGuard)
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @Body() dto: RefreshTokenDto,
    @AccessToken() accessToken?: string,
  ): Promise<void> {
    return this.authService.logout(dto.refreshToken, accessToken);
  }

  // POST /api/v1/auth/revoke
  // Revoga o access token atual, tornando-o inválido imediatamente.
  // Útil para logout forçado, mudança de senha, ou revogação de sessão comprometida.
  @UseGuards(JwtAuthGuard)
  @Post('revoke')
  @HttpCode(HttpStatus.NO_CONTENT)
  async revoke(@AccessToken() accessToken?: string): Promise<void> {
    if (!accessToken) {
      throw new UnauthorizedException('Token não informado');
    }

    await this.authService.revokeAccessToken(accessToken);
  }

  // GET /api/v1/auth/me
  @UseGuards(JwtAuthGuard)
  @Get('me')
  async me(@CurrentUser() user: AuthUserDto): Promise<AuthUserDto> {
    return this.authService.me(user.id);
  }
}
