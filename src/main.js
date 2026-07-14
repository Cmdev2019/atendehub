import { StrictMode, createElement } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

import { Sidebar } from "./components/Sidebar";
import { Topbar } from "./components/Topbar";
import { Metrics } from "./components/Metrics";
import { ConversationQueue } from "./components/ConversationQueue";
import { ChatPanel } from "./components/ChatPanel";
import { CustomerPanel } from "./components/CustomerPanel";
import { useConversations } from "./hooks/useConversations";

const h = createElement;

function App() {
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

const container = document.getElementById("root");
if (!container) throw new Error("Elemento #root não encontrado no DOM.");

createRoot(container).render(h(StrictMode, null, h(App)));
