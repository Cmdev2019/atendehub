# 🔒 Relatório de Auditoria de Segurança - AtendeHub

**Data:** 12/07/2026  
**Versão:** 0.1.0  
**Status:** ⚠️ CRÍTICO - Correções imediatas necessárias

---

## 📊 Sumário Executivo

Foram encontrados **3 problemas críticos**, **2 importantes** e **5 menores** que precisam correção.

| Severidade | Quantidade | Status |
|-----------|-----------|--------|
| 🔴 Crítico | 3 | Requer correção imediata |
| 🟠 Importante | 2 | Requer correção em breve |
| 🟡 Menor | 5 | Requer correção planejada |

---

## 🔴 PROBLEMAS CRÍTICOS

### 1. **Credencial MinIO Hardcoded**
**Arquivo:** `apps/api/src/shared/storage/storage.service.ts:31`  
**Severidade:** CRÍTICO  
**Tipo:** Security - Credential Exposure

```typescript
secretKey: this.config.get<string>('MINIO_ROOT_PASSWORD', 'minio_secret_123'),
```

**Problema:**
- Senha padrão hardcoded `'minio_secret_123'` é usada como fallback
- Qualquer pessoa com acesso ao código fonte tem acesso às credenciais MinIO
- Expõe dados de mídia em produção se `MINIO_ROOT_PASSWORD` não estiver configurado

**Impacto:**
- Acesso não autorizado ao MinIO
- Vazamento de dados de mídia (imagens, vídeos, áudios)
- Possível modificação ou exclusão de arquivos

**Solução:**
```typescript
const secretKey = this.config.get<string>('MINIO_ROOT_PASSWORD');
if (!secretKey) {
  throw new Error('MINIO_ROOT_PASSWORD não configurado — segurança em risco');
}
```

---

### 2. **Credenciais de Seed Hardcoded**
**Arquivo:** `apps/api/prisma/seed.ts:29`  
**Severidade:** CRÍTICO  
**Tipo:** Security - Default Credentials

```typescript
const passwordHash = await bcrypt.hash("Admin@123", 12);
```

**Problema:**
- Conta de admin demo com senha padrão `Admin@123`
- Seed executado automaticamente expõe credenciais
- Credenciais exibidas em logs (linhas 105-106)

**Impacto:**
- Qualquer pessoa conhecendo a senha pode acessar conta admin de teste
- Se rodado em produção, compromete toda a segurança do sistema
- Dados sensíveis visíveis em logs

**Solução:**
```typescript
// Gerar senha aleatória
import { randomBytes } from 'crypto';
const tempPassword = randomBytes(16).toString('hex');
const passwordHash = await bcrypt.hash(tempPassword, 12);

// Não exibir em logs — salvar em arquivo seguro
console.log('Credenciais de seed criadas. Salve em local seguro.');
```

---

### 3. **Secrets JWT Não Validados em Development**
**Arquivo:** `apps/api/src/main.ts:74-85`  
**Severidade:** CRÍTICO  
**Tipo:** Security - Weak Secret Management

**Problema:**
- Validação de secrets apenas lança warning em development
- Possibilita deployments com secrets frágeis
- Placeholders inseguros são aceitos em dev

**Impacto:**
- Código de desenvolvimento pode ser deployado sem alterar secrets
- Possível uso de tokens forjados
- Falta de proteção em ambiente de staging

**Solução:**
```typescript
// Validar também em staging
const isProduction = nodeEnv === 'production';
const isStaging = nodeEnv === 'staging';

if ((isProduction || isStaging) && (isInsecure(jwtSecret) || isInsecure(jwtRefreshSecret))) {
  throw new Error(`❌ ${msg}`);
}
```

---

## 🟠 PROBLEMAS IMPORTANTES

### 4. **Type `any` em Query de Filtro**
**Arquivo:** `apps/api/src/modules/conversation/conversation.service.ts:54`  
**Severidade:** IMPORTANTE  
**Tipo:** Code Quality - Type Safety

```typescript
const where: any = {
  // ...
};
```

**Problema:**
- Uso de `any` desativa verificação de tipo
- Possível construção incorreta de queries de filtro
- Dificulta refactoring e manutenção

**Solução:**
```typescript
interface ConversationWhere {
  companyId: string;
  status?: ConversationStatus;
  channel?: Channel;
  agentId?: string | null;
  departmentId?: string;
  search?: string;
}

const where: ConversationWhere = {
  // ...
};
```

---

### 5. **Validação de URL em DTOs**
**Arquivo:** `apps/api/src/modules/contact/dto/create-contact.dto.ts:28`  
**Severidade:** IMPORTANTE  
**Tipo:** Security - Input Validation

```typescript
@IsUrl()
avatarUrl?: string;
```

**Problema:**
- `@IsUrl()` valida formato, mas não protocolo
- URLs `javascript:` ou `data:` podem ser aceitas
- Pode levar a XSS se URL for renderizada em frontend

**Solução:**
Implementar validador customizado:
```typescript
import { ValidatorConstraint, ValidatorConstraintInterface } from 'class-validator';

@ValidatorConstraint({ name: 'isSafeUrl', async: false })
export class IsSafeUrlConstraint implements ValidatorConstraintInterface {
  validate(url: string): boolean {
    try {
      const parsed = new URL(url);
      return ['http:', 'https:'].includes(parsed.protocol);
    } catch {
      return false;
    }
  }
}
```

---

## 🟡 PROBLEMAS MENORES

### 6. **Arquivo `.env` Versionado**
**Arquivo:** `apps/api/.env`  
**Severidade:** MENOR  
**Tipo:** Security - Secret Exposure

**Problema:**
- Arquivo `.env` é versionado no Git
- Pode conter secrets reais

**Solução:**
```bash
# Adicionar ao .gitignore
echo ".env" >> .gitignore
echo "*.local" >> .gitignore

# Usar .env.example para documentar variáveis
```

---

### 7. **Falta de Rate Limiting em Upload**
**Arquivo:** `apps/api/src/shared/storage/storage.service.ts`  
**Severidade:** MENOR  
**Tipo:** Security - DoS Prevention

**Problema:**
- Upload de archivos sem validação de tamanho
- Sem limite de requisições por usuário
- Possível ataque de negação de serviço (DoS)

**Solução:**
```typescript
async upload(
  stream: Buffer | Readable,
  mimeType: string,
  companyId: string,
  originalName?: string,
  size?: number,
): Promise<UploadResult> {
  // Validar tamanho máximo (ex: 50MB)
  const MAX_SIZE = 50 * 1024 * 1024;
  if (size && size > MAX_SIZE) {
    throw new BadRequestException('Arquivo muito grande');
  }
  // ...
}
```

---

### 8. **Logs Contêm Dados Sensíveis**
**Arquivo:** `apps/api/src/modules/auth/auth.service.ts:77`  
**Severidade:** MENOR  
**Tipo:** Security - Information Disclosure

```typescript
this.logger.log(`Login: ${user.email} (${user.companyId})`);
```

**Problema:**
- Email registrado em log pode ser coletado por malware
- Não oferece valor real para debugging

**Solução:**
```typescript
this.logger.log(`Login realizado (companyId: ${user.companyId})`);
```

---

### 9. **Falta de HTTPS em Development**
**Arquivo:** `apps/api/src/main.ts:31`  
**Severidade:** MENOR  
**Tipo:** Security - Transport Security

**Problema:**
- CORS configura `http://localhost:3000`
- Em desenvolvimento local, sem HTTPS
- Tokens podem ser interceptados em rede não segura

**Solução:**
Usar HTTPS mesmo em desenvolvimento:
```typescript
const origins = process.env.CORS_ORIGINS?.split(',') ?? 
  [process.env.NODE_ENV === 'development' ? 'http://localhost:3000' : 'https://app.example.com'];
```

---

### 10. **Validação Incompleta de Telefone**
**Arquivo:** `apps/api/src/modules/contact/dto/create-contact.dto.ts:20`  
**Severidade:** MENOR  
**Tipo:** Code Quality - Input Validation

```typescript
@Matches(/^\d{10,15}$/, { message: 'Telefone deve conter entre 10 e 15 dígitos numéricos' })
phone: string;
```

**Problema:**
- Regex muito simples não valida formato real de telefone
- Números inválidos podem ser aceitos
- Dificulta integração com APIs externas

**Solução:**
```typescript
import { IsMobilePhone } from 'class-validator';

@IsMobilePhone('pt-BR') // Valida formato brasileiro
phone: string;
```

---

## ✅ PONTOS POSITIVOS

### Segurança Bem Implementada

1. **Autenticação JWT com Blacklist**
   - Implementação correta de revogação de tokens
   - Uso de Redis para TTL automático

2. **Validação de Entrada**
   - DTOs com `class-validator` robusto
   - Whitelist de campos obrigatório

3. **Proteção contra Timing Attacks**
   - Uso de `timingSafeEqual` no webhook (linha 126)
   - Comparação de hashes em tempo constante

4. **Proteção de Senha**
   - Uso de bcrypt com salt rounds = 12
   - Hashing de refresh tokens em SHA-256

5. **Isolamento de Tenant**
   - Queries validam `companyId`
   - Prevenção de acesso cross-company

6. **Rate Limiting Global**
   - ThrottlerGuard aplicado globalmente
   - Configurável via env vars

7. **Helmet & Compression**
   - Headers de segurança HTTP
   - Compressão de resposta

---

## 🚀 Recomendações Gerais

### Curto Prazo (Imediato)
- [ ] Remover senha hardcoded MinIO
- [ ] Renovar credenciais de seed
- [ ] Remover `.env` do versionamento

### Médio Prazo (Sprint Atual)
- [ ] Implementar tipos genéricos ao invés de `any`
- [ ] Adicionar validadores customizados para URLs
- [ ] Remover dados sensíveis de logs

### Longo Prazo (Roadmap)
- [ ] Implementar OWASP Top 10 checklist
- [ ] Adicionar WAF (Web Application Firewall)
- [ ] Testes de penetração antes de produção
- [ ] Rotação de secrets automatizada

---

## 📋 Checklist de Correção

```markdown
## Críticos
- [ ] Remover senha MinIO hardcoded (storage.service.ts:31)
- [ ] Remover credenciais de seed hardcoded (seed.ts:29)
- [ ] Validar secrets em staging também (main.ts:74-85)

## Importantes
- [ ] Substituir `any` por tipos genéricos (conversation.service.ts:54)
- [ ] Criar validador customizado de URL (create-contact.dto.ts:28)

## Menores
- [ ] Adicionar .env ao .gitignore
- [ ] Implementar limite de tamanho de upload
- [ ] Remover dados sensíveis de logs
- [ ] Configurar HTTPS em development
- [ ] Usar IsMobilePhone validator

## Documentação
- [ ] Criar SECURITY.md com guidelines
- [ ] Documentar variáveis .env obrigatórias
- [ ] Adicionar CONTRIBUTING.md com checklist de segurança
```

---

## 📞 Próximos Passos

1. **Priorizar correções críticas** - Todas as 3 podem ser exploradas
2. **Criar SECURITY.md** - Documentar policies de segurança
3. **Setup CI/CD checks** - Validar secrets antes de commit
4. **Testes de segurança** - Integrar ferramentas como:
   - `npm audit` (vulnerabilidades de dependências)
   - `snyk` (análise de código)
   - `OWASP ZAP` (teste dinâmico)

---

**Relatório preparado por:** Claude Code Security Analyzer  
**Próxima revisão:** Após implementação das correções críticas
