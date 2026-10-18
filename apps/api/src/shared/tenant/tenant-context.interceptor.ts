import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { runWithTenant } from './tenant-context';

// B-83 (M-19 / B-41): roda o handler HTTP dentro do contexto da empresa do
// usuário autenticado. Interceptors rodam depois dos guards, então `req.user`
// já foi preenchido pelo JwtStrategy — que, por sua vez, consulta o banco sem
// contexto (o usuário ainda não é conhecido nesse ponto).
@Injectable()
export class TenantContextInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();

    const companyId: string | undefined = context.switchToHttp().getRequest()?.user?.companyId;
    if (!companyId) return next.handle();

    // O handler só executa ao assinar o Observable — assinando dentro do
    // contexto, todo o código assíncrono dele herda a empresa.
    return new Observable((subscriber) =>
      runWithTenant(companyId, () => next.handle().subscribe(subscriber)),
    );
  }
}
