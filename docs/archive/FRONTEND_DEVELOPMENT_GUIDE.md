# 🚀 Guia de Desenvolvimento Frontend - AtendeHub

---

## 📋 Status Atual

✅ **MVP Funcional** - Interface completa de atendimento  
📱 **React 19** - Componentes funcionais  
⚡ **Vite 6** - Build rápido  
🎨 **Design System** - Cores e tipografia definidas

---

## 🎯 Fases de Desenvolvimento

### Fase 0: Estruturação (AGORA)
**Objetivo:** Organizar o código base  
**Tempo:** 2-3 horas

```markdown
Tarefas:
- [ ] Dividir main.js em componentes separados
- [ ] Criar pasta components/
- [ ] Criar pasta hooks/
- [ ] Criar pasta services/
- [ ] Criar pasta styles/
- [ ] Adicionar .env.example
```

### Fase 1: Integração com API (Próxima)
**Objetivo:** Conectar com backend  
**Tempo:** 4-5 horas

```markdown
Tarefas:
- [ ] Criar service de API (http client)
- [ ] Implementar login/logout
- [ ] Fetch de conversas
- [ ] Fetch de mensagens
- [ ] Envio de mensagens
- [ ] Tratamento de erros
- [ ] Loading states
```

### Fase 2: Real-time (Sprint 2)
**Objetivo:** WebSocket e updates em tempo real  
**Tempo:** 3-4 horas

```markdown
Tarefas:
- [ ] Conectar WebSocket
- [ ] Receber mensagens em tempo real
- [ ] Indicador de digitação
- [ ] Status online/offline
- [ ] Notificações
```

### Fase 3: Features (Sprint 3)
**Objetivo:** Novas funcionalidades  
**Tempo:** 4-6 horas

```markdown
Tarefas:
- [ ] Módulo Contatos
- [ ] Módulo Automações
- [ ] Módulo Funis
- [ ] Módulo Relatórios
- [ ] Módulo Configurações
```

---

## 🔧 Estrutura Recomendada

### Passo 1: Criar Pasta de Componentes

```bash
mkdir -p src/components
mkdir -p src/hooks
mkdir -p src/services
mkdir -p src/styles
mkdir -p src/utils
mkdir -p src/pages
```

### Passo 2: Dividir Components

**src/components/Sidebar.jsx**
```jsx
export default function Sidebar() {
  // ... código atual da função Sidebar
}
```

**src/components/Topbar.jsx**
```jsx
export default function Topbar() {
  // ... código atual da função Topbar
}
```

**src/components/Metrics.jsx**
```jsx
export default function Metrics() {
  // ... código atual da função Metrics
}
```

**E assim para os outros componentes...**

### Passo 3: Criar Hooks Customizados

**src/hooks/useConversations.js**
```javascript
import { useState, useCallback } from 'react';

export function useConversations() {
  const [conversations, setConversations] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Fetch conversas do backend
  const fetchConversations = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/v1/conversations');
      const data = await response.json();
      setConversations(data);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    conversations,
    setConversations,
    activeId,
    setActiveId,
    loading,
    error,
    fetchConversations,
  };
}
```

**src/hooks/useAuth.js**
```javascript
import { useState, useCallback } from 'react';

export function useAuth() {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [loading, setLoading] = useState(false);

  const login = useCallback(async (email, password) => {
    setLoading(true);
    try {
      const response = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      
      const data = await response.json();
      if (!response.ok) throw new Error(data.message);
      
      localStorage.setItem('token', data.accessToken);
      setToken(data.accessToken);
      setUser(data.user);
      return true;
    } catch (error) {
      console.error('Login failed:', error);
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('token');
    setToken(null);
    setUser(null);
  }, []);

  return { user, token, loading, login, logout, isAuthenticated: !!token };
}
```

**src/hooks/useFetch.js**
```javascript
import { useState, useEffect } from 'react';

export function useFetch(url) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!url) return;

    const fetchData = async () => {
      try {
        const token = localStorage.getItem('token');
        const response = await fetch(url, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!response.ok) throw new Error('Failed to fetch');
        const json = await response.json();
        setData(json);
      } catch (err) {
        setError(err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [url]);

  return { data, loading, error };
}
```

### Passo 4: Criar Service de API

**src/services/api.js**
```javascript
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api/v1';

function getToken() {
  return localStorage.getItem('token');
}

function getHeaders() {
  const token = getToken();
  return {
    'Content-Type': 'application/json',
    ...(token && { Authorization: `Bearer ${token}` }),
  };
}

export const api = {
  // Auth
  async login(email, password) {
    const response = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ email, password }),
    });
    if (!response.ok) throw new Error('Login failed');
    return response.json();
  },

  async logout() {
    const token = getToken();
    localStorage.removeItem('token');
    return fetch(`${API_URL}/auth/logout`, {
      method: 'POST',
      headers: getHeaders(),
    });
  },

  // Conversations
  async getConversations() {
    const response = await fetch(`${API_URL}/conversations`, {
      headers: getHeaders(),
    });
    if (!response.ok) throw new Error('Failed to fetch conversations');
    return response.json();
  },

  async getConversation(id) {
    const response = await fetch(`${API_URL}/conversations/${id}`, {
      headers: getHeaders(),
    });
    if (!response.ok) throw new Error('Failed to fetch conversation');
    return response.json();
  },

  // Messages
  async getMessages(conversationId) {
    const response = await fetch(`${API_URL}/conversations/${conversationId}/messages`, {
      headers: getHeaders(),
    });
    if (!response.ok) throw new Error('Failed to fetch messages');
    return response.json();
  },

  async sendMessage(conversationId, text) {
    const response = await fetch(`${API_URL}/messages`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ conversationId, text }),
    });
    if (!response.ok) throw new Error('Failed to send message');
    return response.json();
  },

  // Contacts
  async getContacts() {
    const response = await fetch(`${API_URL}/contacts`, {
      headers: getHeaders(),
    });
    if (!response.ok) throw new Error('Failed to fetch contacts');
    return response.json();
  },
};
```

### Passo 5: Criar App Refatorizado

**src/App.jsx**
```jsx
import { useState } from 'react';
import { useConversations } from './hooks/useConversations';
import { useAuth } from './hooks/useAuth';
import Sidebar from './components/Sidebar';
import Topbar from './components/Topbar';
import Metrics from './components/Metrics';
import ConversationQueue from './components/ConversationQueue';
import ChatPanel from './components/ChatPanel';
import CustomerPanel from './components/CustomerPanel';

export default function App() {
  const { conversations, setConversations, activeId, setActiveId } = useConversations();
  const { user, isAuthenticated } = useAuth();
  const [draft, setDraft] = useState('');

  if (!isAuthenticated) {
    // Renderizar login page (criar LoginPage component)
    return <div>Login</div>;
  }

  const activeConversation = conversations.find((c) => c.id === activeId);

  const handleSendMessage = async (text) => {
    if (!activeConversation) return;

    try {
      // Enviar para backend
      const response = await fetch('/api/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({
          conversationId: activeConversation.id,
          text,
        }),
      });

      if (!response.ok) throw new Error('Failed to send message');

      // Atualizar localmente
      setConversations((prev) =>
        prev.map((conv) =>
          conv.id === activeId
            ? {
                ...conv,
                messages: [
                  ...conv.messages,
                  {
                    id: Date.now(),
                    type: 'agent',
                    text,
                    time: new Date().toLocaleTimeString('pt-BR', {
                      hour: '2-digit',
                      minute: '2-digit',
                    }),
                  },
                ],
              }
            : conv
        )
      );
      setDraft('');
    } catch (error) {
      console.error('Error sending message:', error);
      // Mostrar toast de erro
    }
  };

  return (
    <div className="app-shell">
      <Sidebar />
      <main className="workspace">
        <Topbar />
        <Metrics />
        <section className="inbox-layout">
          <ConversationQueue
            activeId={activeId}
            conversations={conversations}
            onSelect={setActiveId}
          />
          {activeConversation && (
            <>
              <ChatPanel
                conversation={activeConversation}
                draft={draft}
                onDraftChange={setDraft}
                onSend={() => handleSendMessage(draft)}
              />
              <CustomerPanel conversation={activeConversation} />
            </>
          )}
        </section>
      </main>
    </div>
  );
}
```

### Passo 6: Criar .env para Configurações

**src/.env.example**
```bash
VITE_API_URL=http://localhost:3001/api/v1
VITE_WS_URL=ws://localhost:3001
VITE_APP_NAME=AtendeHub
```

**src/.env.development**
```bash
VITE_API_URL=http://localhost:3001/api/v1
VITE_WS_URL=ws://localhost:3001
```

**src/.env.production**
```bash
VITE_API_URL=https://api.atendehub.com/api/v1
VITE_WS_URL=wss://api.atendehub.com
```

---

## 📝 Exemplo de Migração Completa

### ANTES (tudo em main.js)
```
src/
├── main.js (550 linhas)
├── styles.css
└── index.html
```

### DEPOIS (bem estruturado)
```
src/
├── components/
│   ├── Sidebar.jsx
│   ├── Topbar.jsx
│   ├── Metrics.jsx
│   ├── ConversationQueue.jsx
│   ├── ChatPanel.jsx
│   ├── CustomerPanel.jsx
│   ├── ContextItem.jsx
│   └── LoginPage.jsx
├── hooks/
│   ├── useConversations.js
│   ├── useAuth.js
│   ├── useFetch.js
│   └── useWebSocket.js
├── services/
│   └── api.js
├── styles/
│   ├── variables.css
│   ├── buttons.css
│   ├── cards.css
│   └── layout.css
├── utils/
│   └── helpers.js
├── App.jsx (100 linhas)
├── main.jsx
├── .env.example
└── index.html
```

---

## 🔌 Integração com Backend

### Checklist de Integração

```markdown
## Autenticação
- [ ] Página de login
- [ ] Armazenar token
- [ ] Headers com Authorization
- [ ] Refresh token automático
- [ ] Logout

## Conversas
- [ ] Fetch inicial ao abrir
- [ ] Atualizar quando nova chegar
- [ ] Filtros funcionando
- [ ] Busca funcionando

## Mensagens
- [ ] Carregar histórico
- [ ] Enviar nova mensagem
- [ ] Receber em tempo real
- [ ] Auto-scroll funcional

## Usuário
- [ ] Dados do usuário logado
- [ ] Perfil do cliente
- [ ] Avatar/Foto

## WebSocket
- [ ] Conexão estabelecida
- [ ] Eventos de mensagem
- [ ] Eventos de status
- [ ] Reconectar automaticamente
```

---

## 🚀 Checklist de Build

```bash
# Build para produção
npm run build

# Verificar arquivos gerados
ls -lh dist/

# Preview local
npm run preview

# Verificar tamanho de bundle
npm run build -- --analyze  # (com plugin)
```

---

## 📦 Próximas Dependências (Futuro)

```json
{
  "dependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "react-router-dom": "^6.x",        // Routing
    "zustand": "^4.x",                  // State management
    "react-hot-toast": "^2.x",          // Notifications
    "date-fns": "^2.x",                 // Date formatting
    "axios": "^1.x"                     // HTTP client
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.x",
    "@testing-library/react": "^14.x",
    "@testing-library/jest-dom": "^6.x",
    "vitest": "^1.x",
    "prettier": "^3.x",
    "eslint": "^8.x"
  }
}
```

---

## 🎯 Timeline Sugerido

```
Semana 1:
├─ Mon: Estruturação (2-3h)
├─ Tue-Wed: Refatoração em componentes (3-4h)
└─ Thu-Fri: Integração com API (4-5h)

Semana 2:
├─ Mon-Tue: WebSocket e real-time (3-4h)
├─ Wed-Thu: Novos módulos (4-6h)
└─ Fri: Testes e refinamentos (3-4h)
```

---

## ✅ Checklist Final

```markdown
## Estrutura
- [ ] Components divididos
- [ ] Hooks criados
- [ ] Services implementados
- [ ] Styles organizados
- [ ] Utils criados

## Qualidade
- [ ] ESLint configurado
- [ ] Prettier configurado
- [ ] .env.example criado
- [ ] Documentação atualizada
- [ ] README completo

## Funcionalidade
- [ ] Login/logout funcionando
- [ ] Conversas carregando
- [ ] Mensagens enviando
- [ ] WebSocket conectado
- [ ] Erros tratados

## Performance
- [ ] Bundle size verificado
- [ ] Lazy loading implementado
- [ ] Memoization aplicada
- [ ] Network requests otimizadas
```

---

## 📞 Contato & Suporte

Para dúvidas durante o desenvolvimento, consulte:
- FRONTEND_STATUS.md - Status geral
- SECURITY_AUDIT_REPORT.md - Segurança
- Documentação do React: https://react.dev

---

**Próximo passo:** Iniciar estruturação (Passo 1 acima)

