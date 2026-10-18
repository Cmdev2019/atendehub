import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  WsException,
} from '@nestjs/websockets';
import { Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Server, Socket } from 'socket.io';
import { JwtPayload } from '../auth/strategies/jwt.strategy';
import { AccessSessionService } from '../auth/access-session.service';
import { PrismaService } from '../../shared/prisma/prisma.service';
import {
  ConversationScopeService,
  seesWholeCompany,
} from '../../shared/conversation-scope/conversation-scope.service';
import { scopeRoomsForUser } from './scope-rooms';
import { parseCorsOrigins } from '../../shared/http/cors-origins';

// Estende o Socket para carregar os dados do usuário autenticado
export interface AuthenticatedSocket extends Socket {
  user: {
    id: string;
    companyId: string;
    email: string;
    role: string;
  };
}

// Erro de autenticação do handshake. O `data.code` chega ao cliente em
// `connect_error` (err.data) e separa "renove o token" de falha de rede.
function handshakeAuthError(message: string) {
  return Object.assign(new UnauthorizedException(message), { data: { code: 'UNAUTHORIZED' } });
}

// Sala de uma sessão (o `jti` do access token) — o logout derruba só os
// sockets daquela sessão (B-74).
export const sessionRoom = (jti: string) => `session:${jti}`;

@WebSocketGateway({
  cors: {
    origin: parseCorsOrigins(process.env.CORS_ORIGINS),
    credentials: true,
  },
  namespace: '/ws',
  transports: ['websocket', 'polling'],
})
export class EventsGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(EventsGateway.name);


  // B-74 (M-09): o socket cai quando o access token do handshake expira — o
  // cliente reconecta com o token atual (renovado via REST se preciso), e a
  // reconexão passa de novo por todas as checagens.
  private readonly expiryTimers = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly scope: ConversationScopeService,
    private readonly accessSession: AccessSessionService,
  ) {}

  afterInit(server: Server) {
    // Redis Adapter é configurado em main.ts via RedisIoAdapter (B2-6) — este
    // `server` aqui é o Namespace `/ws`, não o Server raiz, e Namespace não
    // tem `.adapter()`.
    this.logger.log('Socket.IO Gateway iniciado em /ws');

    // ── Middleware de autenticação no handshake ────────────────────────────
    server.use((socket: AuthenticatedSocket, next) => {
      void this.authenticate(socket).then(
        () => next(),
        (err: Error) => next(err),
      );
    });
  }

  // B-74 (M-09): antes só a assinatura era conferida — token revogado no
  // logout, de usuário desativado ou de sessão encerrada pela troca de senha
  // ainda abria socket. Agora vale a mesma regra do HTTP (AccessSessionService).
  private async authenticate(socket: AuthenticatedSocket): Promise<void> {
    // B-93 (L-04): só em `auth` (o que o cliente do painel usa). Pela query
    // string o token acabava nos logs de acesso do proxy; pelo header, numa
    // via que nenhum cliente nosso usa.
    const token: string | undefined = socket.handshake.auth?.token;

    if (!token) throw handshakeAuthError('Token não informado');

    let payload: JwtPayload;
    try {
      payload = this.jwtService.verify<JwtPayload>(token, {
        secret: this.config.get<string>('JWT_SECRET'),
      });
    } catch {
      throw handshakeAuthError('Token inválido ou expirado');
    }

    let user;
    try {
      user = await this.accessSession.validate(token, payload);
    } catch (err) {
      throw handshakeAuthError((err as Error).message);
    }

    socket.user = {
      id: user.id,
      companyId: user.companyId,
      email: user.email,
      role: user.role,
    };
    socket.data.jti = payload.jti;
    socket.data.exp = payload.exp;
  }

  // ── Conexão estabelecida ──────────────────────────────────────────────────
  async handleConnection(socket: AuthenticatedSocket) {
    const { id: userId, companyId } = socket.user;

    // Sala da empresa (eventos que não são de conversa, ex. status da
    // conexão do WhatsApp) e sala pessoal do agente. C-10/B-40: eventos de
    // conversa vão só para as salas de escopo — ADMIN/SUPERVISOR na sala
    // da empresa inteira; AGENT na dos seus departamentos e na de conversas
    // sem departamento. Antes, todo socket recebia em tempo real todas as
    // mensagens da empresa. Departamentos mudados durante a sessão valem na
    // próxima conexão.
    await socket.join(`company:${companyId}`);
    await socket.join(`agent:${userId}`);
    if (socket.data.jti) await socket.join(sessionRoom(socket.data.jti));
    this.scheduleExpiry(socket);
    const departmentIds = seesWholeCompany(socket.user)
      ? []
      : await this.scope.departmentIdsOf(userId);
    const scopeRooms = scopeRoomsForUser(socket.user, departmentIds);
    await socket.join(scopeRooms);

    this.logger.log(
      `Cliente conectado: ${socket.id} | user: ${userId} | company: ${companyId}`,
    );

    // Confirma a conexão para o cliente
    socket.emit('connected', {
      socketId: socket.id,
      userId,
      companyId,
      rooms: [`company:${companyId}`, `agent:${userId}`, ...scopeRooms],
    });
  }

  // ── Desconexão ────────────────────────────────────────────────────────────
  handleDisconnect(socket: AuthenticatedSocket) {
    const timer = this.expiryTimers.get(socket.id);
    if (timer) {
      clearTimeout(timer);
      this.expiryTimers.delete(socket.id);
    }

    // socket.user só existe se o handshake passou
    if (socket.user) {
      this.logger.log(`Cliente desconectado: ${socket.id} | user: ${socket.user.id}`);
    }
  }

  // ── Evento: entrar na sala de uma conversa ────────────────────────────────
  @SubscribeMessage('join:conversation')
  async handleJoinConversation(
    @ConnectedSocket() socket: AuthenticatedSocket,
    @MessageBody() data: { conversationId: string },
  ) {
    if (!data?.conversationId) return;

    // Valida se a conversa pertence ao tenant E ao escopo do usuário (C-10/B-40)
    const allowed = await this.scope.canAccess(socket.user, data.conversationId);

    if (!allowed) {
      this.logger.warn(
        `Usuário ${socket.user.id} tentou acessar de forma não autorizada a conversa ${data.conversationId}`
      );
      throw new WsException('Acesso não autorizado a esta conversa.');
    }

    const room = `conversation:${data.conversationId}`;
    await socket.join(room);

    this.logger.debug(
      `${socket.user.id} entrou na sala ${room}`,
    );

    return { joined: room };
  }

  // ── Evento: sair da sala de uma conversa ──────────────────────────────────
  @SubscribeMessage('leave:conversation')
  async handleLeaveConversation(
    @ConnectedSocket() socket: AuthenticatedSocket,
    @MessageBody() data: { conversationId: string },
  ) {
    if (!data?.conversationId) return;

    const room = `conversation:${data.conversationId}`;
    await socket.leave(room);

    this.logger.debug(
      `${socket.user.id} saiu da sala ${room}`,
    );

    return { left: room };
  }

  // ── Evento: ping / keepalive ──────────────────────────────────────────────
  @SubscribeMessage('ping')
  handlePing() {
    return { pong: true, timestamp: Date.now() };
  }

  private scheduleExpiry(socket: AuthenticatedSocket) {
    if (!socket.data.exp) return;
    const ms = Math.max(0, socket.data.exp * 1000 - Date.now());
    const timer = setTimeout(() => {
      this.expiryTimers.delete(socket.id);
      socket.disconnect(true);
    }, ms);
    // Não segura o processo vivo no shutdown só por causa deste timer.
    timer.unref?.();
    this.expiryTimers.set(socket.id, timer);
  }

  // ── Utilitário: total de clientes conectados ──────────────────────────────
  // B-80 (M-27 / B-46): soma de todas as réplicas, pelo adapter do Redis —
  // antes era um Map do processo e cada réplica contava só os seus sockets.
  async getConnectedCount(): Promise<number> {
    const sockets = await this.server.fetchSockets();
    return sockets.length;
  }
}
