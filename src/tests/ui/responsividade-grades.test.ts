import { describe, it, expect } from "vitest";
import { arquivosTsx, lerSemComentarios } from "./_fonte";

// `grid-cols-3` sem breakpoint mantém 3 colunas num celular de 390px — cada uma com ~120px.
// Um campo de CNPJ nessa largura é inutilizável.
//
// Calendário mensal: 7 colunas é a própria forma do dado — rola de lado, não empilha.
const EXCECOES = new Set(["src/app/(app)/tarefas/Calendario.tsx"]);

describe("nenhuma grade espreme no celular", () => {
  it("toda grade de 2+ colunas declara o breakpoint", () => {
    const faltando: string[] = [];
    for (const f of arquivosTsx()) {
      if (EXCECOES.has(f)) continue;
      const linhas = lerSemComentarios(f).split("\n");
      linhas.forEach((linha, i) => {
        if (!/(?<![a-z:])grid-cols-[2-9]/.test(linha)) return;
        if (/(sm|md|lg):grid-cols/.test(linha)) return;
        faltando.push(`${f.replace("src/", "")}:${i + 1}`);
      });
    }
    expect(faltando, `grades sem breakpoint:\n  ${faltando.join("\n  ")}`).toEqual([]);
  });

  it("menção a grid-cols em comentário não é acusada (o FormGrid tem uma)", () => {
    const src = lerSemComentarios("src/components/ui/FormGrid.tsx");
    expect(src).not.toContain("grid-cols-2");
    expect(src).toContain("md:grid-cols-12");
  });
});
