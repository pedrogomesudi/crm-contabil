import { describe, it, expect } from "vitest";
import { montarRelatorioTitulos, type LinhaRelatorioTitulo } from "@/lib/financeiro/relatorio-titulos";

const linha = (
  over: Partial<LinhaRelatorioTitulo["t"]> = {},
  saldo = 500,
  status = "ABERTO",
): LinhaRelatorioTitulo => ({
  t: {
    cliente: "Padaria X",
    grupoNome: null,
    origem: "MENSALIDADE",
    competencia: "2026-08-01",
    vencimento: "2026-09-10",
    valor: 500,
    ...over,
  },
  saldo,
  status,
});

const ctx = {
  competencia: "2026-08-01",
  filtro: "TODOS" as const,
  grupoSel: "TODOS",
  grupos: [{ id: "g1", nome: "Grupo Alfa" }],
  busca: "",
};

describe("montarRelatorioTitulos — colunas e valores", () => {
  it("leva as colunas da tela mais Grupo e Competência, nessa ordem", () => {
    const r = montarRelatorioTitulos([linha()], ctx);
    expect(r.colunas.map((c) => c.chave)).toEqual([
      "cliente",
      "grupo",
      "origem",
      "competencia",
      "vencimento",
      "valor",
      "saldo",
      "status",
    ]);
  });

  it("valor e saldo vão como número cru (o Excel precisa somar, não ler texto)", () => {
    const r = montarRelatorioTitulos([linha({}, 300)], ctx);
    expect(r.linhas[0]!.valor).toBe(500);
    expect(r.linhas[0]!.saldo).toBe(300);
    expect(r.colunas.find((c) => c.chave === "valor")!.formato).toBe("moeda");
  });

  it("vencimento vai em ISO (a camada de exportação é que formata)", () => {
    const r = montarRelatorioTitulos([linha()], ctx);
    expect(r.linhas[0]!.vencimento).toBe("2026-09-10");
    expect(r.colunas.find((c) => c.chave === "vencimento")!.formato).toBe("data");
  });

  it("competência sai como mm/aaaa em texto, para não se confundir com vencimento", () => {
    const r = montarRelatorioTitulos([linha()], ctx);
    expect(r.linhas[0]!.competencia).toBe("08/2026");
    expect(r.colunas.find((c) => c.chave === "competencia")!.formato).toBe("texto");
  });

  it("traduz origem e status para os mesmos rótulos da tela", () => {
    const r = montarRelatorioTitulos(
      [
        linha({ origem: "RECEITA_AVULSA" }, 0, "BAIXADO"),
        linha({ origem: "DECIMO_TERCEIRO" }, 500, "VENCIDO"),
        linha({ origem: "MENSALIDADE" }, 500, "BAIXADO_PARCIAL"),
      ],
      ctx,
    );
    expect(r.linhas.map((l) => l.origem)).toEqual(["Avulsa", "13º", "Mensalidade"]);
    expect(r.linhas.map((l) => l.status)).toEqual(["Recebido", "Vencido", "Recebido parcial"]);
  });

  it("título sem grupo deixa a coluna vazia", () => {
    const r = montarRelatorioTitulos([linha({ grupoNome: null }), linha({ grupoNome: "Grupo Alfa" })], ctx);
    expect(r.linhas.map((l) => l.grupo)).toEqual(["", "Grupo Alfa"]);
  });
});

describe("montarRelatorioTitulos — linha de totais", () => {
  it("soma valor e saldo e conta os títulos", () => {
    const r = montarRelatorioTitulos([linha({ valor: 500 }, 300), linha({ valor: 250 }, 250)], ctx);
    expect(r.totais).toMatchObject({ cliente: "Total (2 títulos)", valor: 750, saldo: 550 });
  });

  it("um título só fica no singular", () => {
    expect(montarRelatorioTitulos([linha()], ctx).totais).toMatchObject({ cliente: "Total (1 título)" });
  });

  it("sem linhas não há o que somar — a linha de totais é omitida", () => {
    const r = montarRelatorioTitulos([], ctx);
    expect(r.linhas).toEqual([]);
    expect(r.totais).toBeUndefined();
  });
});

describe("montarRelatorioTitulos — subtítulo registra o recorte", () => {
  it("sem filtro nenhum, só a competência", () => {
    expect(montarRelatorioTitulos([linha()], ctx).subtitulo).toBe("Competência 08/2026");
  });

  it("registra o filtro de status pelo rótulo da tela", () => {
    const r = montarRelatorioTitulos([linha()], { ...ctx, filtro: "VENCIDO" });
    expect(r.subtitulo).toBe("Competência 08/2026 · Vencido");
  });

  it("registra o grupo escolhido pelo nome", () => {
    const r = montarRelatorioTitulos([linha()], { ...ctx, grupoSel: "g1" });
    expect(r.subtitulo).toBe("Competência 08/2026 · Grupo Alfa");
  });

  it("registra o recorte 'Sem grupo'", () => {
    const r = montarRelatorioTitulos([linha()], { ...ctx, grupoSel: "SEM_GRUPO" });
    expect(r.subtitulo).toBe("Competência 08/2026 · Sem grupo");
  });

  it("registra a busca entre aspas, já aparada", () => {
    const r = montarRelatorioTitulos([linha()], { ...ctx, busca: "  padaria  " });
    expect(r.subtitulo).toBe('Competência 08/2026 · busca: "padaria"');
  });

  it("acumula todos os recortes ativos, na ordem da barra de filtros", () => {
    const r = montarRelatorioTitulos([linha()], {
      ...ctx,
      filtro: "ABERTO",
      grupoSel: "g1",
      busca: "padaria",
    });
    expect(r.subtitulo).toBe('Competência 08/2026 · Em aberto · Grupo Alfa · busca: "padaria"');
  });

  it("o título é fixo, e é dele que sai o nome do arquivo", () => {
    expect(montarRelatorioTitulos([linha()], ctx).titulo).toBe("Contas a receber");
  });
});

// Os testes acima verificam a MONTAGEM. Estes executam a serialização de verdade: um relatório
// que só é validado como objeto pode quebrar na hora de virar arquivo, e aí o usuário é quem
// descobre. Rodam em CI, sem rede e sem banco.
describe("montarRelatorioTitulos — serializa de ponta a ponta", () => {
  const rel = () =>
    montarRelatorioTitulos(
      [
        linha({ cliente: "Padaria X", grupoNome: "Grupo Alfa" }, 300),
        linha({ cliente: "Mercado Y", origem: "RECEITA_AVULSA", valor: 250 }, 0, "BAIXADO"),
      ],
      { ...ctx, filtro: "ABERTO", grupoSel: "g1" },
    );

  it("vira um XLSX de verdade (ZIP começa com PK)", async () => {
    const { paraXlsx } = await import("@/lib/exportar/xlsx");
    const buf = await paraXlsx(rel());
    expect(buf.subarray(0, 2).toString()).toBe("PK");
    expect(buf.length).toBeGreaterThan(1000);
  });

  it("vira um CSV com o cabeçalho, as linhas e os totais", async () => {
    const { paraCsv } = await import("@/lib/exportar/csv");
    const csv = paraCsv(rel());
    expect(csv).toContain("Cliente");
    expect(csv).toContain("Competência");
    expect(csv).toContain("Padaria X");
    expect(csv).toContain("Grupo Alfa");
    expect(csv).toContain("Total (2 títulos)");
  });

  it("vira um HTML com título e o recorte aplicado (é a base do PDF)", async () => {
    const { paraHtml } = await import("@/lib/exportar/html");
    const html = paraHtml(rel());
    expect(html).toContain("Contas a receber");
    expect(html).toContain("Competência 08/2026 · Em aberto · Grupo Alfa");
    expect(html).toContain("Mercado Y");
  });

  it("não quebra com a tabela vazia (mês sem títulos, ou filtro que não casa nada)", async () => {
    const vazio = montarRelatorioTitulos([], ctx);
    const { paraXlsx } = await import("@/lib/exportar/xlsx");
    expect((await paraXlsx(vazio)).subarray(0, 2).toString()).toBe("PK");
    const { paraCsv } = await import("@/lib/exportar/csv");
    expect(paraCsv(vazio)).toContain("Cliente");
  });
});
