import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { FiltroGrupo } from "@/components/financeiro/FiltroGrupo";

const grupos = [
  { id: "g1", nome: "Grupo Alfa" },
  { id: "g2", nome: "Grupo Beta" },
];
const noop = () => {};

describe("FiltroGrupo", () => {
  it("lista todos os grupos da competência, mais 'Todos' e 'Sem grupo'", () => {
    const html = renderToStaticMarkup(<FiltroGrupo grupos={grupos} valor="TODOS" onMudar={noop} />);
    expect(html).toContain("Grupo Alfa");
    expect(html).toContain("Grupo Beta");
    expect(html).toContain("Todos os grupos");
    expect(html).toContain("Sem grupo");
  });
  it("marca como selecionado o grupo em vigor", () => {
    const html = renderToStaticMarkup(<FiltroGrupo grupos={grupos} valor="g2" onMudar={noop} />);
    expect(html).toMatch(/<option[^>]*value="g2"[^>]*selected/);
  });
  it("some da tela quando a competência não tem nenhum título em grupo", () => {
    expect(renderToStaticMarkup(<FiltroGrupo grupos={[]} valor="TODOS" onMudar={noop} />)).toBe("");
  });
});
