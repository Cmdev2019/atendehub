import { Module } from '@nestjs/common';
import { TokenBlacklistService } from './token-blacklist.service';
import { AccessSessionService } from './access-session.service';

// B-74 (M-09): separado do AuthModule para o EventsModule validar o
// handshake do WebSocket sem importar o AuthModule inteiro — que, por sua
// vez, importa o EventsModule para derrubar sockets ao encerrar sessões.
@Module({
  providers: [TokenBlacklistService, AccessSessionService],
  exports: [TokenBlacklistService, AccessSessionService],
})
export class SessionModule {}
