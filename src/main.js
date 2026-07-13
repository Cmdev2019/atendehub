import { StrictMode, createElement, useState, useRef, useEffect } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

const h = createElement;

// ---------------------------------------------------------------------------
// Data — separado dos componentes para facilitar migração futura para API/store
// ---------------------------------------------------------------------------

const initialConversations = [
  {
    id: "conv-1",
    contact: "Marina Alves",
    initials: "MA",
    summary: "Pedido parado no transporte",
    badge: "Urgente",
    tone: "red",
    channel: "WhatsApp",
    phone: "+55 11 98234-0091",
    status: "Aguardando cliente",
    agent: "Camila",
    wait: "12 min",
    value: "R$ 289,90",
    tags: ["Entrega", "Prioridade", "E-commerce"],
    timeline: ["Pedido #4832 criado", "Pagamento aprovado", "Coleta atrasada"],
    messages: [
      { id: "m1", type: "customer", text: "Oi, meu pedido não atualiza há três dias. Conseguem verificar?", time: "10:12" },
      { id: "m2", type: "agent",    text: "Claro, Marina. Vou conferir o rastreio e já retorno com uma posição.", time: "10:14" },
      { id: "m3", type: "customer", text: "Obrigada. Preciso receber até amanhã.", time: "10:15" },
    ],
  },
  {
    id: "conv-2",
    contact: "Lucas Pereira",
    initials: "LP",
    summary: "Quer trocar o plano mensal",
    badge: "WhatsApp",
    tone: "blue",
    channel: "WhatsApp",
    phone: "+55 21 97011-2048",
    status: "Em atendimento",
    agent: "Nando",
    wait: "4 min",
    value: "R$ 1.188,00",
    tags: ["Plano anual", "Comercial"],
    timeline: ["Assinatura mensal ativa", "Cupom aplicado", "Aguardando aceite"],
    messages: [
      { id: "m1", type: "customer", text: "Quero trocar do plano mensal para o anual.", time: "09:48" },
      { id: "m2", type: "agent",    text: "Consigo ajudar. Vou simular a diferença e te envio as opções.", time: "09:50" },
    ],
  },
  {
    id: "conv-3",
    contact: "Bia Santos",
    initials: "BS",
    summary: "Comentário recebido no Instagram",
    badge: "Social",
    tone: "green",
    channel: "Instagram",
    phone: "@bia.santos",
    status: "Nova conversa",
    agent: "Fila geral",
    wait: "2 min",
    value: "Sem pedido",
    tags: ["Instagram", "Produto"],
    timeline: ["Comentou no post", "Mensagem direta aberta"],
    messages: [
      { id: "m1", type: "customer", text: "Vi o produto no Instagram. Ainda tem na cor preta?", time: "11:01" },
      { id: "m2", type: "agent",    text: "Temos sim. Posso reservar uma unidade para você.", time: "11:03" },
    ],
  },
  {
    id: "conv-4",
    contact: "Rafael Costa",
    initials: "RC",
    summary: "Solicitou segunda via da nota",
    badge: "E-mail",
    tone: "amber",
    channel: "E-mail",
    phone: "rafael.costa@email.com",
    status: "Pendente interno",
    agent: "Juliana",
    wait: "28 min",
    value: "R$ 640,00",
    tags: ["Financeiro", "Nota fiscal"],
    timeline: ["Pedido faturado", "Nota enviada", "Reenvio solicitado"],
    messages: [
      { id: "m1", type: "customer", text: "Preciso da segunda via da nota fiscal do último pedido.", time: "08:42" },
      { id: "m2", type: "agent",    text: "Sem problema. Vou localizar pelo CPF cadastrado.", time: "08:55" },
    ],
  },
];

const modules = [
  { label: "Caixa de entrada", amount: "34" },
  { label: "Automações",       amount: "8"  },
  { label: "Contatos",         amount: ""   },
  { label: "Funis",            amount: ""   },
  { label: "Relatórios",       amount: ""   },
  { label: "Configurações",    amount: ""   },
];

const channels = [
  { type: "whatsapp",  label: "WhatsApp",  amount: 18 },
  { type: "instagram", label: "Instagram", amount: 7  },
  { type: "email",     label: "E-mail",    amount: 5  },
  { type: "site",      label: "Chat site", amount: 4  },
];

const metrics = [
  { label: "Conversas abertas",  value: "34",     note: "6 urgentes"        },
  { label: "Primeira resposta",  value: "2m 41s", note: "Meta: 5 min"       },
  { label: "Resolvidas hoje",    value: "128",    note: "+18% vs. ontem"    },
  { label: "Satisfação",         value: "92%",    note: "384 avaliações"    },
];

// ---------------------------------------------------------------------------
// Utilitário — gera IDs simples para novas mensagens
// ---------------------------------------------------------------------------
let _msgCounter = 0;
function newMsgId() {
  _msgCounter += 1;
  return `new-${_msgCounter}`;
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------
function App() {
  const [conversations, setConversations] = useState(initialConversations);
  // Usa id único em vez do nome como chave
  const [activeId, setActiveId] = useState(initialConversations[0].id);
  const [draft, setDraft] = useState("");

  const activeConversation = conversations.find((c) => c.id === activeId);

  function sendMessage() {
    const text = draft.trim();
    if (!text) return;

    const now = new Date();
    const time = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

    setConversations((prev) =>
      prev.map((conv) =>
        conv.id === activeId
          ? { ...conv, messages: [...conv.messages, { id: newMsgId(), type: "agent", text, time }] }
          : conv,
      ),
    );
    setDraft("");
  }

  return h(
    "div",
    { className: "app-shell" },
    h(Sidebar),
    h(
      "main",
      { className: "workspace" },
      h(Topbar),
      h(Metrics),
      h(
        "section",
        { className: "inbox-layout" },
        h(ConversationQueue, {
          activeId,
          conversations,
          onSelect: setActiveId,
        }),
        activeConversation &&
          h(ChatPanel, {
            conversation: activeConversation,
            draft,
            onDraftChange: setDraft,
            onSend: sendMessage,
          }),
        activeConversation &&
          h(CustomerPanel, {
            conversation: activeConversation,
          }),
      ),
    ),
  );
}

// ---------------------------------------------------------------------------
// Sidebar
// ---------------------------------------------------------------------------
function Sidebar() {
  return h(
    "aside",
    { className: "sidebar", "aria-label": "Navegação principal" },
    h(
      "div",
      { className: "brand" },
      h("span", { className: "brand-mark", "aria-hidden": "true" }, "A"),
      h("div", null,
        h("strong", null, "AtendeHub"),
        h("span", null, "Omnichannel inbox"),
      ),
    ),
    h(
      "nav",
      { className: "nav-list" },
      modules.map(({ label, amount }, index) =>
        h(
          "button",
          {
            key: label,
            className: `nav-item${index === 0 ? " active" : ""}`,
            type: "button",
          },
          h("span", null, label),
          amount ? h("strong", null, amount) : null,
        ),
      ),
    ),
    h(
      "section",
      { className: "channel-panel", "aria-labelledby": "channels-title" },
      h("h2", { id: "channels-title" }, "Canais conectados"),
      channels.map(({ type, label, amount }) =>
        h(
          "div",
          { key: type, className: "channel-row" },
          h("span", { className: `dot ${type}`, "aria-hidden": "true" }),
          h("span", null, label),
          h("strong", null, amount),
        ),
      ),
    ),
  );
}

// ---------------------------------------------------------------------------
// Topbar
// ---------------------------------------------------------------------------
function Topbar() {
  return h(
    "header",
    { className: "topbar" },
    h(
      "div",
      null,
      h("p", { className: "eyebrow" }, "Central operacional"),
      h("h1", null, "Caixa de entrada unificada"),
    ),
    h(
      "div",
      { className: "topbar-actions" },
      h("button", { className: "icon-button", type: "button", "aria-label": "Pesquisar" }, "⌕"),
      h("button", { className: "ghost-button", type: "button" }, "Transferir"),
      h("button", { className: "primary-button", type: "button" }, "Novo atendimento"),
    ),
  );
}

// ---------------------------------------------------------------------------
// Metrics
// ---------------------------------------------------------------------------
function Metrics() {
  return h(
    "section",
    { className: "metrics", "aria-label": "Indicadores rápidos" },
    metrics.map(({ label, value, note }) =>
      h(
        "article",
        { key: label, className: "metric-card" },
        h("span", null, label),
        h("strong", null, value),
        h("small", null, note),
      ),
    ),
  );
}

// ---------------------------------------------------------------------------
// ConversationQueue
// ---------------------------------------------------------------------------
function ConversationQueue({ activeId, conversations, onSelect }) {
  return h(
    "div",
    { className: "queue", "aria-label": "Lista de conversas" },
    h(
      "div",
      { className: "section-header" },
      h("div", null,
        h("h2", null, "Atendimentos"),
        h("small", null, "Fila por prioridade e SLA"),
      ),
      h("button", { type: "button" }, "Filtrar"),
    ),
    h(
      "div",
      { className: "search-box" },
      h("span", { "aria-hidden": "true" }, "⌕"),
      h("input", {
        type: "search",
        placeholder: "Buscar contato, canal ou tag",
        "aria-label": "Buscar conversa",
      }),
    ),
    h(
      "div",
      { className: "queue-tabs", role: "tablist", "aria-label": "Filtros de fila" },
      ["Todas", "Minhas", "Aguardando"].map((tab, index) =>
        h("button", {
          key: tab,
          className: index === 0 ? "active" : "",
          type: "button",
          role: "tab",
          "aria-selected": index === 0,
        }, tab),
      ),
    ),
    h(
      "div",
      { className: "conversation-list" },
      conversations.map((conv) =>
        h(
          "button",
          {
            key: conv.id,
            className: `conversation${activeId === conv.id ? " active" : ""}`,
            type: "button",
            "aria-current": activeId === conv.id ? "true" : undefined,
            onClick: () => onSelect(conv.id),
          },
          h("span", { className: `avatar ${conv.tone}`, "aria-hidden": "true" }, conv.initials),
          h(
            "span",
            { className: "conversation-main" },
            h(
              "span",
              { className: "conversation-title" },
              h("strong", null, conv.contact),
              h("em", null, conv.wait),
            ),
            h("small", null, conv.summary),
            h(
              "span",
              { className: "conversation-meta" },
              h("b", null, conv.channel),
              h("span", null, conv.agent),
            ),
          ),
          h(
            "span",
            { className: `badge${conv.badge === "Urgente" ? " urgent" : ""}` },
            conv.badge,
          ),
        ),
      ),
    ),
  );
}

// ---------------------------------------------------------------------------
// ChatPanel
// ---------------------------------------------------------------------------
function ChatPanel({ conversation, draft, onDraftChange, onSend }) {
  const messagesRef = useRef(null);

  // Rola automaticamente para a última mensagem ao trocar de conversa ou enviar
  useEffect(() => {
    if (messagesRef.current) {
      messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
    }
  }, [conversation.messages]);

  function handleKeyDown(event) {
    // Ctrl+Enter ou Cmd+Enter envia a mensagem
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      onSend();
    }
  }

  return h(
    "article",
    { className: "chat-panel", "aria-label": "Conversa selecionada" },
    h(
      "header",
      { className: "chat-header" },
      h(
        "div",
        { className: "chat-person" },
        h("span", { className: `avatar ${conversation.tone}`, "aria-hidden": "true" }, conversation.initials),
        h("div", null,
          h("p", { className: "eyebrow" }, conversation.channel),
          h("h2", null, conversation.contact),
        ),
      ),
      h(
        "div",
        { className: "chat-actions" },
        h("span", { className: "status-pill" }, conversation.status),
        h("button", { className: "icon-button small", type: "button", "aria-label": "Mais opções" }, "⋯"),
      ),
    ),
    h(
      "div",
      { className: "message-date" },
      h("span", null, "Hoje"),
    ),
    h(
      "div",
      {
        ref: messagesRef,
        className: "messages",
        role: "log",
        "aria-live": "polite",
        "aria-label": "Mensagens da conversa",
      },
      conversation.messages.map(({ id, type, text, time }) =>
        h(
          "div",
          { key: id, className: `message ${type}` },
          h("span", null, text, h("small", null, time)),
        ),
      ),
    ),
    h(
      "footer",
      { className: "composer" },
      h(
        "div",
        { className: "quick-replies", "aria-label": "Respostas rápidas" },
        ["Confirmar dados", "Enviar rastreio", "Encaminhar", "Finalizar"].map((reply) =>
          h(
            "button",
            {
              key: reply,
              type: "button",
              onClick: () => onDraftChange(reply),
            },
            reply,
          ),
        ),
      ),
      h(
        "div",
        { className: "composer-box" },
        h("label", { className: "sr-only", htmlFor: "message-input" }, "Mensagem"),
        h("textarea", {
          id: "message-input",
          rows: 3,
          placeholder: "Digite uma resposta ou use um modelo salvo (Ctrl+Enter para enviar)",
          value: draft,
          onChange: (event) => onDraftChange(event.target.value),
          onKeyDown: handleKeyDown,
        }),
      ),
      h(
        "div",
        { className: "composer-actions" },
        h("button", { className: "ghost-button", type: "button" }, "Anexar"),
        h(
          "button",
          {
            className: "send-button",
            type: "button",
            onClick: onSend,
            disabled: !draft.trim(),
            "aria-label": "Enviar mensagem",
          },
          "Enviar",
        ),
      ),
    ),
  );
}

// ---------------------------------------------------------------------------
// CustomerPanel
// ---------------------------------------------------------------------------
function CustomerPanel({ conversation }) {
  return h(
    "aside",
    { className: "customer-panel", "aria-label": "Contexto do cliente" },
    h(
      "section",
      { className: "customer-head" },
      h("span", { className: `avatar large ${conversation.tone}`, "aria-hidden": "true" }, conversation.initials),
      h("div", null,
        h("h2", null, conversation.contact),
        h("p", null, conversation.phone),
      ),
    ),
    h(
      "section",
      { className: "context-grid", "aria-label": "Dados do atendimento" },
      h(ContextItem, { label: "Responsável", value: conversation.agent }),
      h(ContextItem, { label: "SLA",         value: conversation.wait  }),
      h(ContextItem, { label: "Valor",       value: conversation.value }),
      h(ContextItem, { label: "Canal",       value: conversation.channel }),
    ),
    h(
      "section",
      { className: "info-section" },
      h("h3", null, "Tags"),
      h(
        "div",
        { className: "tag-list" },
        conversation.tags.map((tag) => h("span", { key: tag }, tag)),
      ),
    ),
    h(
      "section",
      { className: "info-section" },
      h("h3", null, "Histórico"),
      h(
        "ol",
        { className: "timeline" },
        conversation.timeline.map((item) => h("li", { key: item }, item)),
      ),
    ),
    h(
      "section",
      { className: "info-section" },
      h("h3", null, "Ações rápidas"),
      h("button", { className: "wide-action", type: "button" }, "Criar tarefa"),
      h("button", { className: "wide-action", type: "button" }, "Mover para funil"),
      h("button", { className: "wide-action danger", type: "button" }, "Finalizar conversa"),
    ),
  );
}

// ---------------------------------------------------------------------------
// ContextItem
// ---------------------------------------------------------------------------
function ContextItem({ label, value }) {
  return h(
    "div",
    { className: "context-item" },
    h("span", null, label),
    h("strong", null, value),
  );
}

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------
const container = document.getElementById("root");
if (!container) throw new Error("Elemento #root não encontrado no DOM.");

createRoot(container).render(h(StrictMode, null, h(App)));
