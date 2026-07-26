import { StrictMode, createElement, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

import { initMonitoring } from "./services/monitoring";
import { AuthProvider, AuthContext } from "./context/AuthContext";
import { ThemeProvider } from "./context/ThemeContext";
import { ConfirmProvider } from "./context/ConfirmContext";
import { useAuth } from "./hooks/useAuth";
import { LoginPage } from "./pages/LoginPage";

import { Sidebar } from "./components/Sidebar";
import { Topbar } from "./components/Topbar";
import { Metrics } from "./components/Metrics";
import { ConversationQueue } from "./components/ConversationQueue";
import { ChatPanel } from "./components/ChatPanel";
import { CustomerPanel } from "./components/CustomerPanel";
import { SettingsPanel } from "./components/settings/SettingsPanel";
import { DemoBanner } from "./components/DemoBanner";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { useConversations } from "./hooks/useConversations";

initMonitoring(); // B-18

const h = createElement;

const VIEW_TITLES = {
  inbox: "Caixa de Entrada",
  settings: "Configurações",
};

// Dashboard - Página principal do sistema
function Dashboard() {
  const [view, setView] = useState("inbox");
  const { user } = useAuth();
  const {
    conversations,
    activeId,
    setActiveId,
    draft,
    setDraft,
    activeConversation,
    sendMessage,
    sendError,
    stats,
    loadMoreConversations,
    queueHasMore,
    queueLoadingMore,
    loadMoreMessages,
    loadingOlderMessages,
    availableTags,
    addTagToConversation,
    removeTagFromConversation,
    closedConversations,
    closedHasMore,
    closedLoadingMore,
    loadClosedConversations,
    loadMoreClosedConversations,
    attendConversation,
    closeConversation,
  } = useConversations();

  // Atender (B-31): assume a conversa da fila em nome do usuário logado e já
  // abre ela — atendimento começa direto, sem precisar de um segundo clique.
  const handleAttend = async (conversationId) => {
    if (!user) return;
    const ok = await attendConversation(conversationId, { id: user.id, name: user.name });
    if (ok) setActiveId(conversationId);
  };

  return h(
    "div",
    { className: "app-container" },
    h(Topbar, {
      title: VIEW_TITLES[view] ?? VIEW_TITLES.inbox,
      onOpenSettings: () => setView("settings"),
    }),
    h(
      "div",
      { className: "main-layout" },
      h(Sidebar, { activeView: view, onNavigate: setView }),
      view === "settings"
        ? h("div", { className: "workspace workspace-settings" }, h(SettingsPanel))
        : h(
            "div",
            { className: "workspace-inbox" },
            h(Metrics, { stats }),
            h(
              "div",
              { className: "workspace" },
              h(
                "section",
                { className: "conversation-area" },
                h(ConversationQueue, {
                  activeId,
                  conversations,
                  onSelect: setActiveId,
                  onLoadMore: loadMoreConversations,
                  hasMore: queueHasMore,
                  loadingMore: queueLoadingMore,
                  closedConversations,
                  closedHasMore,
                  closedLoadingMore,
                  onLoadClosed: loadClosedConversations,
                  onLoadMoreClosed: loadMoreClosedConversations,
                  currentUserId: user?.id,
                  onAttend: handleAttend,
                }),
              ),
              activeConversation &&
                h(
                  "section",
                  { className: "chat-area" },
                  h(ChatPanel, {
                    conversation: activeConversation,
                    draft,
                    onDraftChange: setDraft,
                    onSend: sendMessage,
                    sendError,
                    onLoadMoreMessages: loadMoreMessages,
                    loadingOlderMessages,
                    onCloseConversation: closeConversation,
                  }),
                ),
              activeConversation &&
                h(
                  "section",
                  { className: "details-area" },
                  h(CustomerPanel, {
                    conversation: activeConversation,
                    availableTags,
                    onAddTag: addTagToConversation,
                    onRemoveTag: removeTagFromConversation,
                  }),
                ),
            ),
          ),
    ),
  );
}

// AppContent - Lógica de roteamento baseada em autenticação
function AppContent() {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return h(
      "div",
      { className: "loading-screen" },
      h("div", { className: "spinner" }),
      h("p", null, "Carregando..."),
    );
  }

  // DemoBanner fora do ternário: cobre tanto o login quanto o dashboard
  return h(
    "div",
    { className: "app-shell" },
    h(DemoBanner),
    isAuthenticated ? h(Dashboard) : h(LoginPage),
  );
}

// App - Wrapper com AuthProvider e ThemeProvider
function App() {
  return h(
    StrictMode,
    null,
    h(
      ThemeProvider,
      null,
      h(
        AuthProvider,
        null,
        h(ConfirmProvider, null, h(ErrorBoundary, null, h(AppContent))),
      ),
    ),
  );
}

const container = document.getElementById("root");
if (!container) throw new Error("Elemento #root não encontrado no DOM.");

createRoot(container).render(h(App));
