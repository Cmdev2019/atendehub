// B-84 (M-10): junta uma rajada de chamadas numa só, no fim da rajada.
// Usado para recarregar métricas e notificações a partir de eventos de socket
// — antes, cada evento fazia cada navegador aberto refazer a busca.
export function debounce(fn, waitMs) {
  let timer = null;

  function debounced(...args) {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn(...args);
    }, waitMs);
  }

  debounced.cancel = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };

  return debounced;
}
