import { useState } from 'react';
import { initialConversations } from '../data/mockConversations';

let _msgCounter = 0;
function newMsgId() {
  _msgCounter += 1;
  return `new-${_msgCounter}`;
}

export function useConversations() {
  const [conversations, setConversations] = useState(initialConversations);
  const [activeId, setActiveId] = useState(initialConversations[0]?.id);
  const [draft, setDraft] = useState('');

  const activeConversation = conversations.find((c) => c.id === activeId);

  const sendMessage = () => {
    const text = draft.trim();
    if (!text) return;

    const now = new Date();
    const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    setConversations((prev) =>
      prev.map((conv) =>
        conv.id === activeId
          ? { ...conv, messages: [...conv.messages, { id: newMsgId(), type: 'agent', text, time }] }
          : conv,
      ),
    );
    setDraft('');
  };

  return {
    conversations,
    activeId,
    setActiveId,
    draft,
    setDraft,
    activeConversation,
    sendMessage,
  };
}
