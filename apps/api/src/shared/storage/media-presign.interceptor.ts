import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, from } from 'rxjs';
import { mergeMap } from 'rxjs/operators';
import { StorageService } from './storage.service';

// ── B-38 ──────────────────────────────────────────────────────────────────
// Interceptor global: toda resposta HTTP passa por aqui antes de sair para o
// cliente. Qualquer string no corpo que seja uma URL interna do bucket MinIO
// (attachment de mensagem, avatar de usuário, o que vier a existir depois)
// é trocada por uma URL assinada de curta duração — ponto único de saída,
// nenhum controller/service precisa lembrar de presignar manualmente.
// URLs que não são do nosso bucket (avatar do WhatsApp, mídia externa
// encaminhada por link) passam intactas, ver StorageService#presignDeep.
@Injectable()
export class MediaPresignInterceptor implements NestInterceptor {
  constructor(private readonly storage: StorageService) {}

  intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      mergeMap((data) => from(this.storage.presignDeep(data))),
    );
  }
}
