# Teste de Propagação de Eventos Socket.IO com Redis Adapter

## Objetivo
Verificar que eventos emitidos em uma instância do servidor são propagados para clientes conectados em outras instâncias.

## Pré-requisitos
- Redis rodando (`docker compose up -d redis`)
- 2 ou mais instâncias do backend NestJS

## Cenário de Teste

### Setup
1. Subir Redis:
   ```bash
   docker compose up -d redis
   ```

2. Subir primeira instância na porta 3001:
   ```bash
   cd apps/api
   APP_PORT=3001 npm run start:dev
   ```

3. Subir segunda instância na porta 3002:
   ```bash
   cd apps/api
   APP_PORT=3002 npm run start:dev
   ```

### Teste Manual

1. **Cliente A** conecta no servidor 1 (porta 3001):
   ```javascript
   const socket1 = io('http://localhost:3001/ws', {
     auth: { token: 'JWT_TOKEN_VALID' }
   });
   
   socket1.emit('join:conversation', { conversationId: 'conv_123' });
   
   socket1.on('new_message', (data) => {
     console.log('Cliente A recebeu:', data);
   });
   ```

2. **Cliente B** conecta no servidor 2 (porta 3002):
   ```javascript
   const socket2 = io('http://localhost:3002/ws', {
     auth: { token: 'JWT_TOKEN_VALID' }
   });
   
   socket2.emit('join:conversation', { conversationId: 'conv_123' });
   
   socket2.on('new_message', (data) => {
     console.log('Cliente B recebeu:', data);
   });
   ```

3. **Enviar mensagem** via API para a conversa `conv_123`:
   ```bash
   curl -X POST http://localhost:3001/api/v1/messages \
     -H "Authorization: Bearer JWT_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{
       "conversationId": "conv_123",
       "type": "TEXT",
       "content": "Teste de propagação"
     }'
   ```

### Resultado Esperado
- **Cliente A** (conectado no servidor 1) recebe o evento `new_message`
- **Cliente B** (conectado no servidor 2) recebe o evento `new_message`
- Ambos recebem o mesmo payload simultaneamente

### Logs Esperados

**Servidor 1 (porta 3001):**
```
[EventsGateway] Socket.IO Redis Adapter configurado (localhost:6379)
[EventsGateway] Socket.IO Gateway iniciado em /ws
[EventsGateway] Cliente conectado: xyz | user: user_123 | company: comp_456
[EventsService] Emitindo new_message para sala conversation:conv_123
```

**Servidor 2 (porta 3002):**
```
[EventsGateway] Socket.IO Redis Adapter configurado (localhost:6379)
[EventsGateway] Socket.IO Gateway iniciado em /ws
[EventsGateway] Cliente conectado: abc | user: user_789 | company: comp_456
```

### Validação Redis

Verificar que o adapter está usando Redis pub/sub:

```bash
docker exec -it atendehub_redis redis-cli -a redis_secret

# Monitorar comandos pub/sub
> MONITOR

# Você verá mensagens como:
# PUBLISH "socket.io#/#" "{\"type\":2,\"data\":[\"new_message\",{...}],\"nsp\":\"/ws\"}"
```

## Troubleshooting

### Eventos não propagam entre instâncias
- Verificar se ambas as instâncias conectaram ao Redis (log de "Redis Adapter configurado")
- Confirmar que `REDIS_HOST`, `REDIS_PORT` e `REDIS_PASSWORD` estão corretos
- Testar conexão Redis: `redis-cli -h localhost -p 6379 -a redis_secret ping`

### Erro "ECONNREFUSED"
- Redis não está rodando
- Porta ou host incorretos no .env

### Clientes não recebem eventos
- Verificar se entraram na sala correta via `join:conversation`
- Confirmar que o evento está sendo emitido para a sala certa
- Checar autenticação JWT do socket

## Fallback Behavior

Se o Redis Adapter falhar ao conectar (Redis indisponível), o Socket.IO:
- **Continua funcionando** em modo single-instance
- Loga erro: `Falha ao conectar Redis Adapter: ...`
- Eventos só propagam dentro da mesma instância

Isso é intencional (graceful degradation) para permitir desenvolvimento local sem Redis.
