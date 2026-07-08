export function slugify(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function alvoTroca(itens: { id: string; ordem: number }[], id: string, direcao: "cima" | "baixo"): string | null {
  const ord = [...itens].sort((a, b) => a.ordem - b.ordem);
  const idx = ord.findIndex((i) => i.id === id);
  if (idx < 0) return null;
  const alvo = direcao === "cima" ? idx - 1 : idx + 1;
  if (alvo < 0 || alvo >= ord.length) return null;
  return ord[alvo]!.id;
}
