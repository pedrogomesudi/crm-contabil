import { describe, it, expect } from "vitest";
import { arquivosTsx, lerSemComentarios } from "../ui/_fonte";

// O Atendimento é a ÚNICA tela que prende a própria altura à viewport. Com a altura DINÂMICA,
// essa altura muda quando a barra do navegador se esconde ao rolar — e no iOS isso realimenta o
// layout: a barra some, a altura cresce, o conteúdo reflui, a barra volta. O WebKit recalcula até
// o sistema encerrar a aba, e a tela aparece como "This page couldn't load". Só acontece em
// celular, porque só ali a barra se esconde. A viewport MENOR (svh) é estável e encerra o ciclo.
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
