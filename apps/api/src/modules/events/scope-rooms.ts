import { seesWholeCompany, ScopeUser } from '../../shared/conversation-scope/conversation-scope.service';

// C-10/B-40 — salas de Socket.IO por escopo de conversa. As duas funções
// precisam concordar: um evento de conversa vai para `roomsForConversation`,
// e cada socket entra em `scopeRoomsForUser` — a interseção é exatamente quem
// pode ver aquela conversa (mesma regra do ConversationScopeService).

export const allRoom = (companyId: string) => `company:${companyId}:all`;
export const departmentRoom = (companyId: string, departmentId: string | null) =>
  `company:${companyId}:dept:${departmentId ?? 'none'}`;

export function scopeRoomsForUser(
  user: ScopeUser & { companyId: string },
  departmentIds: string[],
): string[] {
  if (seesWholeCompany(user)) return [allRoom(user.companyId)];
  return [
    departmentRoom(user.companyId, null),
    ...departmentIds.map((id) => departmentRoom(user.companyId, id)),
  ];
}

export function roomsForConversation(
  companyId: string,
  conversation: { departmentId: string | null; agentId: string | null } | null,
): string[] {
  if (!conversation) return [allRoom(companyId)];
  return [
    allRoom(companyId),
    departmentRoom(companyId, conversation.departmentId),
    ...(conversation.agentId ? [`agent:${conversation.agentId}`] : []),
  ];
}
