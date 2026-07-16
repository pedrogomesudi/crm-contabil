import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Secao } from "@/components/ui/Secao";
import { Abas } from "@/components/ui/Abas";

describe("Secao", () => {
  it("mostra título, descrição e ações", () => {
    const html = renderToStaticMarkup(
      <Secao titulo="Dados cadastrais" descricao="CNPJ e endereço" acoes={<button>Editar</button>}>
        <p>conteúdo</p>
      </Secao>,
    );
    expect(html).toContain("Dados cadastrais");
    expect(html).toContain("CNPJ e endereço");
    expect(html).toContain("Editar");
    expect(html).toContain("conteúdo");
  });
});

describe("Abas", () => {
  const itens = [
    { chave: "cadastro", rotulo: "Cadastro" },
    { chave: "fiscal", rotulo: "Fiscal", badge: 3 },
  ];

  it("liga cada aba a um link com o estado na URL (voltar e link direto funcionam)", () => {
    const html = renderToStaticMarkup(<Abas itens={itens} ativa="cadastro" base="/clientes/1" />);
    expect(html).toContain("/clientes/1?aba=cadastro");
    expect(html).toContain("/clientes/1?aba=fiscal");
  });

  it("marca a aba ativa para leitor de tela", () => {
    const html = renderToStaticMarkup(<Abas itens={itens} ativa="fiscal" base="/clientes/1" />);
    // Contar ocorrências, não só verificar presença: se TODAS as abas recebessem
    // aria-current, um `toContain` simples passaria igual sem cobrir o requisito
    // (exatamente uma aba ativa).
    const ocorrencias = html.match(/aria-current="page"/g) ?? [];
    expect(ocorrencias).toHaveLength(1);
  });

  it("mostra o badge (um alerta que ninguém vê é um alerta que não existe)", () => {
    expect(renderToStaticMarkup(<Abas itens={itens} ativa="cadastro" base="/x" />)).toContain(">3<");
  });

  it("cai para a primeira aba quando 'ativa' não existe em itens (bookmark antigo)", () => {
    const html = renderToStaticMarkup(<Abas itens={itens} ativa="inexistente" base="/clientes/1" />);
    const ocorrencias = html.match(/aria-current="page"/g) ?? [];
    expect(ocorrencias).toHaveLength(1);
    // A primeira aba (cadastro) é quem assume o papel de ativa.
    const cadastroLink = html.match(/<a[^>]*href="\/clientes\/1\?aba=cadastro"[^>]*>/)?.[0] ?? "";
    expect(cadastroLink).toContain('aria-current="page"');
  });
});
