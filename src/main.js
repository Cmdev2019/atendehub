import { StrictMode, Suspense, createElement, lazy, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

import { initMonitoring } from "./services/monitoring";
import { AuthProvider } from "./context/AuthContext";
import { ThemeProvider } from "./context/ThemeContext";
import { ConfirmProvider } from "./context/ConfirmContext";
import { useAuth } from "./hooks/useAuth";
import { LoginPage } from "./pages/LoginPage";

import { Sidebar } from "./components/Sidebar";
import { Topbar } from "./components/Topbar";
import { Metrics } from "./components/Metrics";
import { ConversationQueue } from "./components/ConversationQueue";
import { ChatPanel } from "./components/ChatPanel";
import { EmptyChatState } from "./components/EmptyChatState";
import { CustomerPanel } from "./components/CustomerPanel";
import { DemoBanner } from "./components/DemoBanner";
import { RealtimeStatusBanner } from "./components/RealtimeStatusBanner";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { useConversations } from "./hooks/useConversations";

// B-105 (L-13): telas fora do atendimento carregam sob demanda — o bundle
// inicial tinha 856 kB (recharts dos gráficos incluso) mesmo para quem só
// atende a fila.
const named = (load, name) => lazy(() => load().then((m) => ({ default: m[name] })));
const DashboardView = named(() => import("./components/DashboardView"), "DashboardView");
const ReportsView = named(() => import("./components/ReportsView"), "ReportsView");
const ContactsView = named(() => import("./components/ContactsView"), "ContactsView");
const SettingsPanel = named(() => import("./components/settings/SettingsPanel"), "SettingsPanel");
const lazyView = (component) =>
  h(Suspense, { fallback: h("div", { className: "loading-screen" }, h("div", { className: "spinner" })) }, h(component));

initMonitoring(); // B-18

const h = createElement;

const VIEW_TITLES = {
  dashboard: "Dashboard",
  inbox: "Caixa de Entrada",
  contacts: "Contatos",
  reports: "Relatórios",
  settings: "Configurações",
};

// Dashboard - Página principal do sistema
function Dashboard() {
  // B-32: dashboard é a 1ª tela do usuário, antes da Caixa de Entrada
  // (pedido do usuário) — substitui "inbox" como view inicial.
  const [view, setView] = useState("dashboard");
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
    loadMoreQueueConversations,
    queueHasMore,
    queueLoadingMore,
    loadMoreMineConversations,
    mineHasMore,
    mineLoadingMore,
    loadMoreOpenConversations,
    openHasMore,
    openLoadingMore,
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
    searchConversations,
    attendConversation,
    closeConversation,
  } = useConversations(user?.id);

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
        ? h("div", { className: "workspace workspace-settings" }, lazyView(SettingsPanel))
        : view === "dashboard"
        ? h("div", { className: "workspace workspace-dashboard" }, lazyView(DashboardView))
        : view === "reports"
        ? h("div", { className: "workspace workspace-reports" }, lazyView(ReportsView))
        : view === "contacts"
        ? h("div", { className: "workspace workspace-contacts" }, lazyView(ContactsView))
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
                  onLoadMoreQueue: loadMoreQueueConversations,
                  hasMore: queueHasMore,
                  loadingMore: queueLoadingMore,
                  onLoadMoreMine: loadMoreMineConversations,
                  mineHasMore,
                  mineLoadingMore,
                  onLoadMoreOpen: loadMoreOpenConversations,
                  openHasMore,
                  openLoadingMore,
                  closedConversations,
                  closedHasMore,
                  closedLoadingMore,
                  onLoadClosed: loadClosedConversations,
                  onLoadMoreClosed: loadMoreClosedConversations,
                  onSearch: searchConversations,
                  currentUserId: user?.id,
                  onAttend: handleAttend,
                }),
              ),
              h(
                "section",
                { className: "chat-area" },
                activeConversation
                  ? h(ChatPanel, {
                      conversation: activeConversation,
                      draft,
                      onDraftChange: setDraft,
                      onSend: sendMessage,
                      sendError,
                      onLoadMoreMessages: loadMoreMessages,
                      loadingOlderMessages,
                      onCloseConversation: closeConversation,
                    })
                  : h(EmptyChatState),
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
    h(RealtimeStatusBanner),
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
