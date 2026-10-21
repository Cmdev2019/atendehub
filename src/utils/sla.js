// B-68 (ADR-0019): estado de um prazo de SLA para a tela — quanto falta, se
// está perto de estourar ou se já estourou. O prazo vem pronto da API
// (`waitSlaDueAt`, `serviceSlaDueAt`), já contado no expediente (B-112), então
// a tela só compara com o relógio.
//
// "Perto de estourar" = o último quinto do prazo, e no mínimo o último minuto:
// num SLA de 5 min, avisa a 1 min do fim; num de 30 min, a 6 min.
const WARNING_SHARE = 0.2;
const WARNING_MIN_MS = 60_000;

export function slaState(startAt, dueAt, now = Date.now(), breachedAt = null) {
  if (!dueAt) return null;
  const due = new Date(dueAt).getTime();
  if (!Number.isFinite(due)) return null;
  const remainingMs = due - now;
  if (breachedAt || remainingMs <= 0) return { level: 'breached', remainingMs };

  const start = startAt ? new Date(startAt).getTime() : NaN;
  const total = Number.isFinite(start) && due > start ? due - start : 0;
  const warnAtMs = Math.max(WARNING_MIN_MS, total * WARNING_SHARE);
  return { level: remainingMs <= warnAtMs ? 'warning' : 'ok', remainingMs };
}

// "4 min", "1 h 20 min", "2 d" — o tempo que falta ou que já passou do prazo
export function formatSlaSpan(ms) {
  const minutes = Math.floor(Math.abs(ms) / 60000);
  if (minutes < 1) return 'menos de 1 min';
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    const rest = minutes % 60;
    return rest ? `${hours} h ${rest} min` : `${hours} h`;
  }
  return `${Math.floor(hours / 24)} d`;
}

export function slaLabel(state) {
  if (!state) return '';
  return state.level === 'breached'
    ? `estourou há ${formatSlaSpan(state.remainingMs)}`
    : `estoura em ${formatSlaSpan(state.remainingMs)}`;
}
