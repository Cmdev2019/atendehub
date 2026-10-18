import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { withTenantRls } from './tenant-rls.extension';

@Global() // disponível em todos os módulos sem precisar importar
@Module({
  providers: [
    {
      provide: PrismaService,
      // B-83 (M-19 / B-41): o cliente injetado em todo o projeto já vem com
      // a extensão do RLS (segue sendo um PrismaService: onModuleInit e
      // instanceof preservados pelo $extends).
      useFactory: () => withTenantRls(new PrismaService()),
    },
  ],
  exports: [PrismaService],
})
export class PrismaModule {}
