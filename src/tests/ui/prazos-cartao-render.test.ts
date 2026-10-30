import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

// As três telas de prazo são o caso clássico de consulta fora da mesa: "o que vence hoje?".
//
// `tarefas/page.tsx` e `obrigacoes/page.tsx` não têm `<table>` — são Server Components que só
// buscam dados e delegam a tabela a um Client Component filho (`PainelTarefas.tsx` e
// `Calendario.tsx`, respectivamente). É nesses filhos que o `TabelaCartao` entra, então o
// teste aponta para onde a tabela de fato vive, não para a página que só a invoca.
// `vencimentos/page.tsx` é a exceção: a tabela está na própria página.
const TELAS = [
  "src/app/(app)/tarefas/PainelTarefas.tsx",
  "src/app/(app)/obrigacoes/Calendario.tsx",
  "src/app/(app)/vencimentos/page.tsx",
];

describe("telas de prazo em cartões", () => {
  it.each(TELAS)("%s usa o TabelaCartao", (caminho) => {
    expect(readFileSync(caminho, "utf8")).toContain("TabelaCartao");
  });

  it.each(TELAS)("%s rotula as células de dado", (caminho) => {
    expect(readFileSync(caminho, "utf8")).toContain("data-rotulo=");
  });

  it.each(TELAS)("%s não rotula a célula de estado vazio nem as de ação", (caminho) => {
    const src = readFileSync(caminho, "utf8");
    // Rótulo em célula de colSpan apareceria por cima da mensagem "nenhum resultado"; em célula
    // de ação, etiquetaria um botão como se fosse dado.
    const celulasColSpan = src.match(/<td[^>]*colSpan[^>]*>/g) ?? [];
    for (const c of celulasColSpan) expect(c, `colSpan com rótulo: ${c}`).not.toContain("data-rotulo");
  });
});
