// B-104 (L-09): tempo decorrido curto para a fila ("agora", "12 min", "3 h",
// "2 d"). Antes, a fila mostrava `conv.wait`, que nunca era preenchido.
export function formatElapsed(date, now = Date.now()) {
  const time = date ? new Date(date).getTime() : NaN;
  if (!Number.isFinite(time)) return '';
  const minutes = Math.floor(Math.max(0, now - time) / 60000);
  if (minutes < 1) return 'agora';
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h`;
  return `${Math.floor(hours / 24)} d`;
}
