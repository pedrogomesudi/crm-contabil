import { describe, it, expect, vi, beforeEach } from "vitest";
import type { MidiaEnvio, ProvedorWhatsapp } from "@/lib/whatsapp/tipos";
import { PARAMS_FLUXO } from "@/lib/whatsapp/politica-proativo";

// Roteamento da MÍDIA na camada proativa (Fatia 3C). A NFS-e é o único fluxo que envia
// arquivo: na Z-API vira mídia com caption; na oficial, cabeçalho de documento no template.

const enviarTexto = vi.fn();
const enviarTemplate = vi.fn();
const enviarMidia = vi.fn();
const statusConexao = vi.fn();

const ativo: { valor: { adaptador: ProvedorWhatsapp; provedor: "zapi" | "oficial" } | { erro: string } } = {
  valor: { adaptador: {} as ProvedorWhatsapp, provedor: "oficial" },
};
vi.mock("@/lib/whatsapp/ativo", () => ({ adaptadorWhatsappAtivo: vi.fn(async () => ativo.valor) }));

const db = {
  templates: [] as { fluxo: string; nome: string; idioma: string }[],
  eventos: [] as Record<string, unknown>[],
};

vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabase: () => ({
    from(tabela: string) {
      if (tabela === "whatsapp_template_fluxo") return { select: async () => ({ data: db.templates }) };
      if (tabela === "whatsapp_mensagem") {
        const chain = {
          eq: () => chain,
          order: () => chain,
          limit: () => chain,
          maybeSingle: async () => ({ data: null }),
        };
        return { select: () => chain };
      }
      if (tabela === "evento_erro") {
        return {
          insert: async (linha: Record<string, unknown>) => {
            db.eventos.push(linha);
            return { error: null };
          },
        };
      }
      throw new Error(`tabela inesperada: ${tabela}`);
    },
  }),
}));

import { criarEnviadorProativo } from "@/lib/whatsapp/proativo";

const PDF: MidiaEnvio = {
  tipo: "document",
  base64: "JVBERi0=",
  mime: "application/pdf",
  nome: "NFS-e Padaria X.pdf",
  caption: "Olá! Segue a sua NFS-e.",
};

const PARAMS = ["Padaria X", "07/2026", "R$ 350,00", "10/08/2026"];

const adaptadorOficial = (): ProvedorWhatsapp => ({
  enviarTexto,
  enviarMidia,
  statusConexao,
  exigeTemplateForaDaJanela: true,
  enviarTemplate,
});

const adaptadorZapi = (): ProvedorWhatsapp => ({
  enviarTexto,
  enviarMidia,
  statusConexao,
  exigeTemplateForaDaJanela: false,
});

async function enviador() {
  const e = await criarEnviadorProativo();
  if ("erro" in e) throw new Error(e.erro);
  return e;
}

const mensagem = () => ({ fluxo: "nfse" as const, texto: PDF.caption, params: PARAMS, midia: PDF });

beforeEach(() => {
  enviarTexto.mockReset().mockResolvedValue({ ok: true });
  enviarMidia.mockReset().mockResolvedValue({ ok: true });
  enviarTemplate.mockReset().mockResolvedValue({ ok: true });
  db.templates = [];
  db.eventos = [];
  ativo.valor = { adaptador: adaptadorOficial(), provedor: "oficial" };
});

describe("NFS-e na Z-API — não regride", () => {
  beforeEach(() => {
    ativo.valor = { adaptador: adaptadorZapi(), provedor: "zapi" };
  });

  it("envia a mídia com o caption idêntico ao de hoje e ignora os params", async () => {
    const r = await (await enviador()).enviar("5511", mensagem());
    expect(r.ok).toBe(true);
    expect(enviarMidia).toHaveBeenCalledWith("5511", PDF);
    expect(enviarTemplate).not.toHaveBeenCalled();
    expect(enviarTexto).not.toHaveBeenCalled();
  });
});

describe("NFS-e na API oficial", () => {
  it("com template configurado, manda o PDF como documento do cabeçalho", async () => {
    db.templates = [{ fluxo: "nfse", nome: "nota_fiscal", idioma: "pt_BR" }];
    const r = await (await enviador()).enviar("5511", mensagem());
    expect(r.ok).toBe(true);
    expect(enviarTemplate).toHaveBeenCalledWith("5511", {
      nome: "nota_fiscal",
      idioma: "pt_BR",
      params: PARAMS,
      documento: { base64: PDF.base64, mime: PDF.mime, nome: PDF.nome },
    });
    expect(enviarMidia).not.toHaveBeenCalled();
  });

  it("sem template configurado, não envia nada e registra o evento", async () => {
    const r = await (await enviador()).enviar("5511", mensagem());
    expect(r.ok).toBe(false);
    expect(r.erro).toMatch(/template/i);
    expect(enviarMidia).not.toHaveBeenCalled();
    expect(enviarTemplate).not.toHaveBeenCalled();
    expect(db.eventos).toHaveLength(1);
    expect(db.eventos[0]!.rota).toBe("whatsapp/proativo/nfse");
  });

  it("fluxo sem mídia continua indo por texto — a mídia é opcional", async () => {
    db.templates = [{ fluxo: "nfse", nome: "nota_fiscal", idioma: "pt_BR" }];
    await (await enviador()).enviar("5511", { fluxo: "nfse", texto: "x", params: PARAMS });
    expect(enviarTemplate).toHaveBeenCalledWith("5511", {
      nome: "nota_fiscal",
      idioma: "pt_BR",
      params: PARAMS,
      documento: undefined,
    });
  });
});

describe("contrato de parâmetros da NFS-e", () => {
  it("tem quatro posições — sem valor e vencimento a cobrança sai incompleta", () => {
    expect(PARAMS_FLUXO.nfse).toEqual(["cliente", "competencia", "valor", "vencimento"]);
  });
});
