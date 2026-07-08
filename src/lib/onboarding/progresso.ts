export type CategoriaOnb = "documento" | "procuracao" | "certificado" | "acesso" | "responsavel";
export type StatusOnb = "pendente" | "concluido" | "dispensado";
export type ItemOnb = { id: string; categoria: CategoriaOnb; nome: string; obrigatorio: boolean; ordem: number; status: StatusOnb; prazo: string | null };

const ORDEM_CAT: CategoriaOnb[] = ["documento", "procuracao", "certificado", "acesso", "responsavel"];

export function progressoOnboarding(itens: ItemOnb[]): { total: number; concluidos: number; obrigatoriosPendentes: number; pct: number; concluido: boolean } {
  const total = itens.length;
  const concluidos = itens.filter((i) => i.status === "concluido").length;
  const obrigatoriosPendentes = itens.filter((i) => i.obrigatorio && i.status === "pendente").length;
  const pct = total === 0 ? 0 : Math.round((concluidos / total) * 100);
  const concluido = total > 0 && itens.filter((i) => i.obrigatorio).every((i) => i.status === "concluido" || i.status === "dispensado");
  return { total, concluidos, obrigatoriosPendentes, pct, concluido };
}

export function agruparPorCategoria<T extends { categoria: CategoriaOnb; ordem: number }>(itens: T[]): { categoria: CategoriaOnb; itens: T[] }[] {
  return ORDEM_CAT.map((categoria) => ({
    categoria,
    itens: itens.filter((i) => i.categoria === categoria).sort((a, b) => a.ordem - b.ordem),
  })).filter((g) => g.itens.length > 0);
}

export function proximoPrazo(itens: ItemOnb[]): string | null {
  const prazos = itens
    .filter((i) => i.status === "pendente" && i.prazo)
    .map((i) => i.prazo as string)
    .sort();
  return prazos[0] ?? null;
}
