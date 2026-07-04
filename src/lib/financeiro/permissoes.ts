import type { Papel } from "@/lib/tipos";

// Fonte única das regras de permissão do módulo financeiro (alinhadas à RLS).

// Cria/edita/inativa os cadastros de apoio (contas, plano de contas, centros de
// custo, fornecedores, serviços). Espelha o INSERT/UPDATE das policies.
export function podeGerenciarFinanceiro(papel: Papel | undefined): boolean {
  return papel === "admin" || papel === "financeiro";
}

// Leitura dos catálogos que o contador precisa para lançar honorários eventuais
// (V6.3): plano de contas e tabela de serviços. Espelha o SELECT dessas tabelas.
export function podeLerCatalogo(papel: Papel | undefined): boolean {
  return papel === "admin" || papel === "financeiro" || papel === "contador";
}
