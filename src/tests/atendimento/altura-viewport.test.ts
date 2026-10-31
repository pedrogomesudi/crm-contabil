import { describe, it, expect } from "vitest";
import { arquivosTsx, lerSemComentarios } from "../ui/_fonte";

// O Atendimento é a única tela que prende a própria altura à viewport. `svh` é a viewport MENOR:
// estável. A dinâmica (`dvh`) muda quando a barra do navegador se esconde ao rolar, e altura que
// muda sozinha faz o conteúdo pular no celular.
//
// Registro honesto: durante a investigação do travamento no iPhone eu atribuí o bug a esta
// unidade. Estava errado — a causa era a CSP bloqueando o WebSocket (ver next.config.ts e o
// teste em src/tests/seguranca/csp.test.ts). A regra fica porque `svh` é a unidade certa aqui,
// não porque conserta aquilo.
//
// Os testes leem o código SEM COMENTÁRIOS: o comentário que explica a decisão cita a unidade
// proibida, e acusá-lo seria falso positivo impossível de silenciar.
describe("altura da tela de Atendimento", () => {
  it("usa a viewport estável, não a dinâmica", () => {
    const src = lerSemComentarios("src/app/(app)/atendimento/page.tsx");
    expect(src).not.toContain("dvh");
    expect(src).toContain("svh");
  });

  it("nenhuma outra tela introduz altura dinâmica sem passar por esta decisão", () => {
    const comDvh = arquivosTsx()
      .filter((f) => lerSemComentarios(f).includes("dvh"))
      .map((f) => f.replace("src/", ""));
    expect(comDvh, `arquivos com altura dinâmica:\n  ${comDvh.join("\n  ")}`).toEqual([]);
  });
});
