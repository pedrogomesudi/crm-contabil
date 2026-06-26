export type ResumoPrevia = {
  importacaoId: string;
  novos: number;
  atualizados: number;
  inalterados: number;
  pendencias: number;
  erros: number;
};
export type EstadoPrevia = { erro?: string; resumo?: ResumoPrevia };
export type EstadoAplicar = { erro?: string; ok?: boolean; gravados?: number };
