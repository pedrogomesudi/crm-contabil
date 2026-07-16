import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { FormClienteV2 } from "@/app/(app)/laboratorio/_propostas/FormClienteV2";
import { FichaV2 } from "@/app/(app)/laboratorio/_propostas/FichaV2";
import { Vitrine } from "@/app/(app)/laboratorio/Vitrine";
import { CLIENTE_FICTICIO, CONTADORES_FICTICIOS } from "@/app/(app)/laboratorio/_dados";

const cadastro = () =>
  renderToStaticMarkup(<FormClienteV2 cliente={CLIENTE_FICTICIO} contadores={CONTADORES_FICTICIOS} />);

describe("FormClienteV2", () => {
  it("não se auto-limita a 672px (o form de hoje usa 58% da largura)", () => {
    expect(cadastro()).not.toContain("max-w-2xl");
  });

  it("dá a cada campo o span da natureza do dado: UF estreita, logradouro largo", () => {
    const html = cadastro();
    expect(html).toContain("md:col-span-1"); // UF
    expect(html).toContain("md:col-span-7"); // logradouro
  });

  it("preserva os names do formulário atual (re-skin não refuncionaliza)", () => {
    const html = cadastro();
    for (const name of ["razao_social", "cpf_cnpj", "logradouro", "numero", "uf", "cep", "email"]) {
      expect(html).toContain(`name="${name}"`);
    }
  });

  it("mostra os dados do cliente fictício", () => {
    expect(cadastro()).toContain("ACME Indústria e Comércio Ltda");
  });
});

describe("FichaV2", () => {
  it("agrupa as 19 seções em 5 abas por afinidade", () => {
    const html = renderToStaticMarkup(<FichaV2 aba="cadastro" />);
    for (const aba of ["Cadastro", "Financeiro", "Fiscal", "Documentos", "Relação"]) {
      expect(html).toContain(aba);
    }
  });

  it("leva o estado da aba na URL (link direto e voltar funcionam)", () => {
    expect(renderToStaticMarkup(<FichaV2 aba="cadastro" />)).toContain("aba=fiscal");
  });

  it("mostra só a aba ativa (o problema de hoje é o scroll infinito)", () => {
    const html = renderToStaticMarkup(<FichaV2 aba="financeiro" />);
    expect(html).toContain("Honorário");
    expect(html).not.toContain("Notas fiscais emitidas");
  });

  it("marca exatamente uma aba como ativa", () => {
    const html = renderToStaticMarkup(<FichaV2 aba="fiscal" />);
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
  });
});

// A rota é admin-only, então um curl sem sessão devolve 307 e nunca exercita o render. Este
// teste é o que prova que cada combinação de tela/modo monta sem estourar.
describe("Vitrine", () => {
  const TELAS = ["cadastro", "ficha", "lista", "painel"];

  it("monta todas as telas nos dois modos", () => {
    for (const tela of TELAS) {
      for (const modo of ["antes", "depois"]) {
        const html = renderToStaticMarkup(<Vitrine tela={tela} modo={modo} aba="cadastro" />);
        expect(html).toContain("Laboratório temporário");
      }
    }
  });

  it("avisa que é temporária e que nada ali é real", () => {
    const html = renderToStaticMarkup(<Vitrine tela="cadastro" modo="depois" aba="cadastro" />);
    expect(html).toContain("os dados são fictícios");
  });

  it("o antes do cadastro mostra o layout de hoje (672px, grid uniforme)", () => {
    const html = renderToStaticMarkup(<Vitrine tela="cadastro" modo="antes" aba="cadastro" />);
    expect(html).toContain("max-w-2xl");
    expect(html).toContain("grid-cols-2");
  });
});
