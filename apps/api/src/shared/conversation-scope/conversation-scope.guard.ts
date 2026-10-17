import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ConversationScopeService } from './conversation-scope.service';

/**
 * C-10/B-40 — barra o acesso a uma conversa fora do escopo do usuário (404).
 *
 * Vale para toda rota com `:conversationId` (mensagens, notas) ou `:id` em
 * controllers de conversa. Rotas sem a conversa na URL (listagem, stats)
 * passam direto — essas aplicam o filtro de escopo na própria consulta.
 * Roda depois do JwtAuthGuard global, então `req.user` já existe.
 */
@Injectable()
export class ConversationScopeGuard implements CanActivate {
  constructor(private readonly scope: ConversationScopeService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const conversationId: string | undefined = req.params?.conversationId ?? req.params?.id;
    if (!conversationId || !req.user) return true;

    await this.scope.assertAccess(req.user, conversationId);
    return true;
  }
}
