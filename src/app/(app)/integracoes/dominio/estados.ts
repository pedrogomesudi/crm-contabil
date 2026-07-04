export type ItemPrevia = {
  classe: "novo" | "atualizado" | "pendencia";
  cpf_cnpj: string;
  razao_social: string;
  regime: string | null;
  diff: Record<string, [unknown, unknown]>;
  pendencias: string[];
};
export type ResumoPrevia = {
  importacaoId: string;
  novos: number;
  atualizados: number;
  inalterados: number;
  pendencias: number;
  erros: number;
  itens: ItemPrevia[];
  avisos?: string[];
};
export type EstadoPrevia = { erro?: string; resumo?: ResumoPrevia };
export type EstadoAplicar = { erro?: string; ok?: boolean; gravados?: number };
