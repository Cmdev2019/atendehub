# Teste de Blacklist de Access Tokens

## Objetivo
Verificar que access tokens revogados são imediatamente invalidados e não podem mais ser usados para acessar rotas protegidas.

## Pré-requisitos
- Redis rodando (`docker compose up -d redis`)
- Backend NestJS rodando (`npm run start:dev`)
- Cliente HTTP (curl, Postman, Insomnia, etc.)

---

## Cenário 1: Revogação explícita via POST /auth/revoke

### 1. Fazer login e obter tokens

```bash
curl -X POST http://localhost:3001/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@demo.com",
    "password": "Admin@123"
  }'
```

**Resposta esperada:**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresIn": 900,
  "user": {
    "id": "user_123",
    "companyId": "comp_456",
    "name": "Admin",
    "email": "admin@demo.com",
    "role": "ADMIN"
  }
}
```

Copie o `accessToken` para os próximos passos.

### 2. Usar o token para acessar rota protegida (deve funcionar)

```bash
curl -X GET http://localhost:3001/api/v1/auth/me \
  -H "Authorization: Bearer SEU_ACCESS_TOKEN"
```

**Resposta esperada:** `200 OK` com dados do usuário

### 3. Revogar o access token

```bash
curl -X POST http://localhost:3001/api/v1/auth/revoke \
  -H "Authorization: Bearer SEU_ACCESS_TOKEN"
```

**Resposta esperada:** `204 No Content`

### 4. Tentar usar o mesmo token novamente (deve falhar)

```bash
curl -X GET http://localhost:3001/api/v1/auth/me \
  -H "Authorization: Bearer SEU_ACCESS_TOKEN"
```

**Resposta esperada:** `401 Unauthorized`
```json
{
  "statusCode": 401,
  "message": "Token foi revogado"
}
```

---

## Cenário 2: Revogação via POST /auth/logout

### 1. Fazer login

```bash
curl -X POST http://localhost:3001/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@demo.com",
    "password": "Admin@123"
  }'
```

Copie `accessToken` e `refreshToken`.

### 2. Fazer logout fornecendo ambos os tokens

```bash
curl -X POST http://localhost:3001/api/v1/auth/logout \
  -H "Authorization: Bearer SEU_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "refreshToken": "SEU_REFRESH_TOKEN"
  }'
```

**Resposta esperada:** `204 No Content`

### 3. Verificar que o access token foi blacklistado

```bash
curl -X GET http://localhost:3001/api/v1/auth/me \
  -H "Authorization: Bearer SEU_ACCESS_TOKEN"
```

**Resposta esperada:** `401 Unauthorized` com `"Token foi revogado"`

### 4. Verificar que o refresh token também foi revogado

```bash
curl -X POST http://localhost:3001/api/v1/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{
    "refreshToken": "SEU_REFRESH_TOKEN"
  }'
```

**Resposta esperada:** `401 Unauthorized` com `"Refresh token inválido ou expirado"`

---

## Cenário 3: TTL automático - Token expira naturalmente

### 1. Verificar chave no Redis imediatamente após revogação

```bash
docker exec -it atendehub_redis redis-cli -a redis_secret

# No Redis CLI:
> KEYS blacklist:token:*
1) "blacklist:token:eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."

> TTL blacklist:token:eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
(integer) 876  # ~14min restantes (se o token tinha 15min)
```

### 2. Aguardar o TTL expirar ou forçar expiração

```bash
# Forçar expiração manual (apenas para teste):
> DEL blacklist:token:eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
(integer) 1
```

### 3. Tentar usar o token após remoção da blacklist

```bash
curl -X GET http://localhost:3001/api/v1/auth/me \
  -H "Authorization: Bearer SEU_ACCESS_TOKEN"
```

**Resposta esperada:** 
- Se o token ainda é válido (não expirou naturalmente): `200 OK`
- Se já expirou naturalmente: `401 Unauthorized` com `"jwt expired"`

---

## Cenário 4: Fail-open se Redis estiver indisponível

### 1. Parar o Redis

```bash
docker compose stop redis
```

### 2. Fazer login (deve funcionar mesmo sem Redis)

```bash
curl -X POST http://localhost:3001/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@demo.com",
    "password": "Admin@123"
  }'
```

**Resposta esperada:** `200 OK` com tokens

### 3. Usar o token para acessar rota protegida

```bash
curl -X GET http://localhost:3001/api/v1/auth/me \
  -H "Authorization: Bearer SEU_ACCESS_TOKEN"
```

**Resposta esperada:** `200 OK` (fail-open — assume token válido)

### 4. Tentar revogar token sem Redis

```bash
curl -X POST http://localhost:3001/api/v1/auth/revoke \
  -H "Authorization: Bearer SEU_ACCESS_TOKEN"
```

**Resposta esperada:** `204 No Content` (não falha, mas não adiciona à blacklist)

### 5. Token continua funcionando (porque blacklist falhou silenciosamente)

```bash
curl -X GET http://localhost:3001/api/v1/auth/me \
  -H "Authorization: Bearer SEU_ACCESS_TOKEN"
```

**Resposta esperada:** `200 OK` (fail-open)

### 6. Restartar Redis

```bash
docker compose start redis
```

---

## Logs Esperados

### No backend (AuthService):
```
[AuthService] Login: admin@demo.com (comp_456)
[TokenBlacklistService] TokenBlacklistService conectado ao Redis
[AuthService] Access token revogado (TTL: 876s)
[JwtStrategy] Token foi revogado (verificação na blacklist)
```

### No Redis (via MONITOR):
```bash
docker exec -it atendehub_redis redis-cli -a redis_secret MONITOR

# Você verá:
"SETEX" "blacklist:token:eyJhbG..." "876" "1"
"EXISTS" "blacklist:token:eyJhbG..."
```

---

## Validação Manual no Redis

### Listar todos os tokens blacklistados:
```bash
redis-cli -a redis_secret KEYS "blacklist:token:*"
```

### Ver TTL de um token específico:
```bash
redis-cli -a redis_secret TTL "blacklist:token:SEU_TOKEN"
```

### Contar tokens na blacklist:
```bash
redis-cli -a redis_secret EVAL "return #redis.call('keys', 'blacklist:token:*')" 0
```

---

## Troubleshooting

### Token revogado mas ainda funciona
- Redis não está rodando → verificar `docker compose ps`
- Token foi removido manualmente da blacklist → verificar `KEYS blacklist:token:*`
- Múltiplas instâncias da API com caches locais → implementação atual não usa cache local, ok

### Erro "Token foi revogado" mesmo após remoção da blacklist
- Cache do Redis ainda não expirou → aguardar TTL ou usar `DEL` para remover
- Token realmente expirou naturalmente → verificar `exp` no payload do JWT

### Redis connection refused
- Redis não está rodando ou porta errada
- Verificar `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD` no `.env`

---

## Casos de Uso Reais

### 1. Logout forçado por mudança de senha
```typescript
// No UserService, após trocar senha:
await authService.revokeAccessToken(currentAccessToken);
```

### 2. Revogar todas as sessões de um usuário comprometido
```bash
# Listar todos os tokens do usuário (requer indexação adicional)
# Por ora, implementação revoga token por token
```

### 3. Revogação em massa por violação de segurança
```bash
# Flush de todas as blacklist keys:
redis-cli -a redis_secret --scan --pattern "blacklist:token:*" | xargs redis-cli -a redis_secret DEL
```

---

## Resultado Esperado Final

✅ Tokens revogados retornam `401 Unauthorized` imediatamente  
✅ TTL automático remove tokens expirados da blacklist  
✅ Fail-open se Redis estiver indisponível (não bloqueia usuários)  
✅ Performance mínima (1 EXISTS no Redis por requisição autenticada)
