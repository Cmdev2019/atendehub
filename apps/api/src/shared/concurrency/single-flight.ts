// ── B-84 (M-10): uma execução por chave, compartilhada por quem chega junto ──
// Chamadas simultâneas com a mesma chave recebem a MESMA promessa; quando ela
// termina, a próxima chamada calcula de novo. Diferente de um cache com TTL,
// nunca devolve resultado velho — só evita refazer o mesmo trabalho em
// paralelo (várias abas do mesmo atendente, rajada de eventos). Vale por
// processo.
export class SingleFlight<T> {
  private readonly inFlight = new Map<string, Promise<T>>();

  run(key: string, compute: () => Promise<T>): Promise<T> {
    const existing = this.inFlight.get(key);
    if (existing) return existing;

    const promise = compute().finally(() => this.inFlight.delete(key));
    this.inFlight.set(key, promise);
    return promise;
  }
}
