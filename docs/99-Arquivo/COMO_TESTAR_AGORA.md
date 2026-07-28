# 🚀 COMO TESTAR O ATENDEHUB AGORA

## ✅ Funciona SEM Backend (Modo Demo)

O sistema foi configurado para funcionar **mesmo sem o backend rodando**. Usa dados mock automáticamente!

---

## 🎯 OPÇÃO 1: Testar COM Backend (Recomendado)

### Pré-requisitos
- Node.js 20+
- Docker (para banco de dados)

### Passo 1: Iniciar Docker (BD, Redis, MinIO)
```bash
docker-compose up -d

# Verifica se subiu corretamente:
docker-compose ps
```

### Passo 2: Iniciar Backend (Terminal 1)
```bash
cd apps/api
npm install  # Primeira vez só
npm run db:migrate  # Aplicar migrations
npm run db:seed     # Criar dados iniciais
npm run start:dev   # Iniciar servidor
```

✅ Deve mostrar:
```
🚀 AtendeHub API rodando em http://localhost:3001/api/v1
✅ Secrets JWT validados com sucesso
```

### Passo 3: Iniciar Frontend (Terminal 2)
```bash
npm run dev
```

✅ Deve abrir: http://localhost:3000

### Passo 4: Fazer Login
```
Email: admin@demo.com
Senha: Admin@123
```

---

## 🎯 OPÇÃO 2: Testar SEM Backend (Modo Demo)

Se não quiser rodar o backend agora, o frontend funciona sozinho com **dados mock**!

### Passo Único: Iniciar Frontend
```bash
npm run dev
```

✅ Acesse: http://localhost:3000

### Fazer Login (Dados Mock)
```
Email: admin@demo.com
Senha: Admin@123
```

Ou outros usuários:
```
agente1@demo.com / Agente@123
supervisor@demo.com / Supervisor@123
```

---

## 🔧 COMO FUNCIONA O FALLBACK

### Fluxo Automático:
1. **Frontend tenta conectar ao backend** em `http://localhost:3001/api/v1`
2. **Se conseguir:** Usa dados reais do backend ✅
3. **Se falhar:** Automáticamente usa **dados mock** do frontend 🎭

### Vantagens do Mock:
- ✅ Funciona offline
- ✅ Sem latência
- ✅ Dados de teste prontos
- ✅ Perfeito para desenvolvimento

### Credenciais Demo (Mock):
```
admin@demo.com      / Admin@123
agente1@demo.com    / Agente@123
supervisor@demo.com / Supervisor@123
```

---

## 📱 Testes Recomendados

### Login
- [ ] Digitar email inválido → Mostrar erro
- [ ] Digitar senha errada → Mostrar erro
- [ ] Login correto → Redirecionar para dashboard
- [ ] Ver "Demo: admin@demo.com" no login

### Dashboard (Após Login)
- [ ] Ver 4 conversas de exemplo
- [ ] Clicar em conversa → Mostrar chat
- [ ] Ver dados do cliente à direita
- [ ] Digitar mensagem → Enviar

### Responsivo
- [ ] Redimensionar janela
- [ ] Testar em mobile (F12 → Device Mode)
- [ ] Login responsivo em mobile

### Logout
- [ ] Clicar logout → Voltar para login
- [ ] Token removido do localStorage

---

## 🆘 Se Continuar com Erro

### Erro: "Failed to fetch"
✅ **NORMAL!** Significa:
- Backend não está rodando (esperado)
- Frontend usando dados mock automaticamente
- Tudo funcionará normalmente com dados de teste

### Verificar Console
```javascript
// Abra DevTools (F12) → Console
// Deve mostrar:
window.apiClient.backendAvailable  // true ou false

// Se false, está usando mock (normal!)
```

### Forçar Mock (Teste)
```javascript
// Console do navegador (F12):
window.USE_MOCK_API = true
location.reload()
```

---

## 🎯 Próximos Passos Após Testar

1. **Se quer rodar BACKEND completo:**
   ```bash
   cd apps/api
   npm run start:dev
   ```
   O frontend se conectará automaticamente!

2. **Se quer só FRONTEND agora:**
   Pronto! Está usando mock e funcionando 100%

3. **Para build production:**
   ```bash
   npm run build
   # Arquivo gerado: dist/
   ```

---

## ✨ Credenciais e Dados

### Usuários de Teste (Mock)
```
Admin:
  Email: admin@demo.com
  Senha: Admin@123
  Role: ADMIN

Agente 1:
  Email: agente1@demo.com
  Senha: Agente@123
  Role: AGENT

Supervisor:
  Email: supervisor@demo.com
  Senha: Supervisor@123
  Role: SUPERVISOR
```

### Conversas de Exemplo (Mock)
- Marina Alves - "Pedido parado no transporte" (Urgente)
- Lucas Pereira - "Quer trocar o plano mensal" (WhatsApp)
- Bia Santos - "Comentário no Instagram" (Social)
- Rafael Costa - "Solicitar 2ª via nota" (Email)

---

## 📊 Ambiente Atual

| Componente | Status | Local |
|-----------|--------|-------|
| Frontend  | ✅ Rodando | http://localhost:3000 |
| Backend   | ⏳ Optional | http://localhost:3001 |
| Mock API  | ✅ Ativo | (Automático) |
| Database  | ⏳ Optional | localhost:5432 |
| Redis     | ⏳ Optional | localhost:6379 |

---

## 🐛 Debug

### Ver se está usando backend ou mock:
```javascript
// Console (F12):
console.log(apiClient.backendAvailable)
// true = Backend
// false = Mock
```

### Ver dados do usuário logado:
```javascript
// Console (F12):
console.log(localStorage.getItem('accessToken'))
// Deve ter um token
```

### Limpar dados (Logout manual):
```javascript
// Console (F12):
localStorage.clear()
location.reload()
```

---

**Pronto para testar? Execute:**

### Opção 1 (Com Backend):
```bash
docker-compose up -d
cd apps/api && npm run start:dev  # Terminal 1
npm run dev                        # Terminal 2
```

### Opção 2 (Sem Backend - Modo Demo):
```bash
npm run dev
# Acesse http://localhost:3000
# Login: admin@demo.com / Admin@123
```

---

Bom teste! 🚀
