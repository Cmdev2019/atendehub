import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Server, Socket } from 'socket.io';
import { JwtPayload } from '../auth/strategies/jwt.strategy';

// Estende o Socket para carregar os dados do usuário autenticado
export interface AuthenticatedSocket extends Socket {
  user: {
    id: string;
    companyId: string;
    email: string;
    role: string;
  };
}

@WebSocketGateway({
  cors: {
    origin: (process.env.CORS_ORIGINS ?? 'http://localhost:3000').split(','),
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

  private readonly connectedClients = new Map<
    string,
    { userId: string; companyId: string; connectedAt: Date }
  >();

  constructor(
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  afterInit(server: Server) {
    this.logger.log('Socket.IO Gateway iniciado em /ws');

    // ── Middleware de autenticação no handshake ────────────────────────────
    server.use((socket: AuthenticatedSocket, next) => {
      try {
        const token =
          socket.handshake.auth?.token ??
          socket.handshake.headers?.authorization?.replace('Bearer ', '') ??
          socket.handshake.query?.token as string;

        if (!token) {
          return next(new UnauthorizedException('Token não informado'));
        }

        const payload = this.jwtService.verify<JwtPayload>(token, {
          secret: this.config.get<string>('JWT_SECRET'),
        });

        socket.user = {
          id: payload.sub,
          companyId: payload.companyId,
          email: payload.email,
          role: payload.role,
        };

        next();
      } catch {
        next(new UnauthorizedException('Token inválido ou expirado'));
      }
    });
  }

  // ── Conexão estabelecida ──────────────────────────────────────────────────
  async handleConnection(socket: AuthenticatedSocket) {
    const { id: userId, companyId } = socket.user;

    // Entra automaticamente na sala da empresa e na sala pessoal do agente
    await socket.join(`company:${companyId}`);
    await socket.join(`agent:${userId}`);

    this.connectedClients.set(socket.id, {
      userId,
      companyId,
      connectedAt: new Date(),
    });

    this.logger.log(
      `Cliente conectado: ${socket.id} | user: ${userId} | company: ${companyId}`,
    );

    // Confirma a conexão para o cliente
    socket.emit('connected', {
      socketId: socket.id,
      userId,
      companyId,
      rooms: [`company:${companyId}`, `agent:${userId}`],
    });
  }

  // ── Desconexão ────────────────────────────────────────────────────────────
  handleDisconnect(socket: AuthenticatedSocket) {
    const client = this.connectedClients.get(socket.id);
    if (client) {
      this.logger.log(
        `Cliente desconectado: ${socket.id} | user: ${client.userId}`,
      );
      this.connectedClients.delete(socket.id);
    }
  }

  // ── Evento: entrar na sala de uma conversa ────────────────────────────────
  @SubscribeMessage('join:conversation')
  async handleJoinConversation(
    @ConnectedSocket() socket: AuthenticatedSocket,
    @MessageBody() data: { conversationId: string },
  ) {
    if (!data?.conversationId) return;

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
  handlePing(@ConnectedSocket() socket: AuthenticatedSocket) {
    return { pong: true, timestamp: Date.now() };
  }

  // ── Utilitário: total de clientes conectados ──────────────────────────────
  getConnectedCount(): number {
    return this.connectedClients.size;
  }
}
