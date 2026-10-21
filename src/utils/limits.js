// Limites que a API aplica e a tela mostra antes de o pedido sair.
// Mantenha igual ao valor da API — ela é quem garante o limite.

// B-116 (decisão do responsável em 2026-10-21): até 20 setores ativos por
// empresa, por enquanto (apps/api/src/modules/department/department.service.ts)
export const MAX_ACTIVE_DEPARTMENTS = 20;
