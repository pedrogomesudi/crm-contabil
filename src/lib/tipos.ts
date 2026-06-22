// Fonte única dos enums (espelham os enums das migrations em supabase/migrations).
// Usados tanto para os tipos TS quanto para os z.enum() das validações.
export const PAPEIS = ["admin", "contador", "assistente", "financeiro"] as const;
export type Papel = (typeof PAPEIS)[number];

export const TIPOS_PESSOA = ["PJ", "PF", "MEI"] as const;
export type TipoPessoa = (typeof TIPOS_PESSOA)[number];

export const REGIMES = ["Simples", "Presumido", "Real", "MEI", "Isento/PF"] as const;
export type RegimeTributario = (typeof REGIMES)[number];

export const STATUS_CLIENTE = ["ativo", "inativo"] as const;
export type StatusCliente = (typeof STATUS_CLIENTE)[number];
