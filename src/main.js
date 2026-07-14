import { StrictMode, createElement, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

import { AuthProvider, AuthContext } from "./context/AuthContext";
import { ThemeProvider } from "./context/ThemeContext";
import { useAuth } from "./hooks/useAuth";
import { LoginPage } from "./pages/LoginPage";

import { Sidebar } from "./components/Sidebar";
import { Topbar } from "./components/Topbar";
import { Metrics } from "./components/Metrics";
import { ConversationQueue } from "./components/ConversationQueue";
import { ChatPanel } from "./components/ChatPanel";
import { CustomerPanel } from "./components/CustomerPanel";
import { useConversations } from "./hooks/useConversations";

const h = createElement;

// Dashboard - Página principal do sistema
function Dashboard() {
  const {
    conversations,
    activeId,
    setActiveId,
    draft,
    setDraft,
    activeConversation,
    sendMessage,
  } = useConversations();

  return h(
    "div",
    { className: "app-container" },
    h(Topbar),
    h(
      "div",
      { className: "main-layout" },
      h(Sidebar),
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
            }),
          ),
        activeConversation &&
          h(
            "section",
            { className: "details-area" },
            h(CustomerPanel, {
              conversation: activeConversation,
            }),
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

  return isAuthenticated ? h(Dashboard) : h(LoginPage);
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
        h(AppContent),
      ),
    ),
  );
}

const container = document.getElementById("root");
if (!container) throw new Error("Elemento #root não encontrado no DOM.");

createRoot(container).render(h(App));
