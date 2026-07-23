import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ProvedorWhatsapp } from "@/lib/whatsapp/tipos";

const enviarTexto = vi.fn();
const enviarTemplate = vi.fn();
const enviarMidia = vi.fn();
const statusConexao = vi.fn();

// O adaptador ativo é trocado por teste (oficial x Z-API).
const ativo: { valor: { adaptador: ProvedorWhatsapp; provedor: "zapi" | "oficial" } | { erro: string } } = {
  valor: { adaptador: {} as ProvedorWhatsapp, provedor: "oficial" },
};
vi.mock("@/lib/whatsapp/ativo", () => ({ adaptadorWhatsappAtivo: vi.fn(async () => ativo.valor) }));

// Estado do "banco" para o mock.
const db = {
  templates: [] as { fluxo: string; nome: string; idioma: string }[],
  ultimaEntradaIn: null as string | null,
  eventos: [] as Record<string, unknown>[],
};

vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabase: () => ({
    from(tabela: string) {
      if (tabela === "whatsapp_template_fluxo") {
        return { select: async () => ({ data: db.templates }) };
      }
      if (tabela === "whatsapp_mensagem") {
        const chain = {
          eq: () => chain,
          order: () => chain,
          limit: () => chain,
          maybeSingle: async () => ({ data: db.ultimaEntradaIn ? { criado_em: db.ultimaEntradaIn } : null }),
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

beforeEach(() => {
  enviarTexto.mockReset().mockResolvedValue({ ok: true });
  enviarTemplate.mockReset().mockResolvedValue({ ok: true });
  db.templates = [];
  db.ultimaEntradaIn = null;
  db.eventos = [];
  ativo.valor = { adaptador: adaptadorOficial(), provedor: "oficial" };
});

describe("enviador proativo — provedor oficial", () => {
  it("régua (sempre_template) com template → usa enviarTemplate com os params", async () => {
    db.templates = [{ fluxo: "regua", nome: "cobranca", idioma: "pt_BR" }];
    const r = await (await enviador()).enviar("5511", { fluxo: "regua", texto: "Olá", params: ["A", "B", "C"] });
    expect(r.ok).toBe(true);
    expect(enviarTexto).not.toHaveBeenCalled();
    expect(enviarTemplate).toHaveBeenCalledWith("5511", {
      nome: "cobranca",
      idioma: "pt_BR",
      params: ["A", "B", "C"],
    });
  });

  it("régua sem template → falha, NÃO envia nada e registra o evento", async () => {
    const r = await (await enviador()).enviar("5511", { fluxo: "regua", texto: "Olá", params: ["A"] });
    expect(r.ok).toBe(false);
    expect(r.erro).toMatch(/template/i);
    expect(enviarTexto).not.toHaveBeenCalled();
    expect(enviarTemplate).not.toHaveBeenCalled();
    expect(db.eventos).toHaveLength(1);
    expect(db.eventos[0]!.rota).toBe("whatsapp/proativo/regua");
  });

  it("fluxo de janela, com cliente falando agora → texto livre (sem template)", async () => {
    db.ultimaEntradaIn = new Date().toISOString();
    const r = await (
      await enviador()
    ).enviar("5511", {
      fluxo: "legalizacao",
      texto: "Etapa concluída",
      params: ["A", "B", "C", "D"],
    });
    expect(r.ok).toBe(true);
    expect(enviarTexto).toHaveBeenCalledWith("5511", "Etapa concluída");
    expect(enviarTemplate).not.toHaveBeenCalled();
  });

  it("fluxo de janela, fora da janela, com template → template", async () => {
    db.ultimaEntradaIn = "2020-01-01T00:00:00.000Z";
    db.templates = [{ fluxo: "legalizacao", nome: "aviso_leg", idioma: "pt_BR" }];
    const r = await (await enviador()).enviar("5511", { fluxo: "legalizacao", texto: "x", params: ["A"] });
    expect(r.ok).toBe(true);
    expect(enviarTemplate).toHaveBeenCalled();
    expect(enviarTexto).not.toHaveBeenCalled();
  });
});

describe("Z-API não regride", () => {
  beforeEach(() => {
    ativo.valor = { adaptador: adaptadorZapi(), provedor: "zapi" };
  });

  it("manda o texto livre, ignora params e nunca exige template", async () => {
    const r = await (
      await enviador()
    ).enviar("5511", {
      fluxo: "regua",
      texto: "Texto exato de hoje",
      params: ["ignorado"],
    });
    expect(r.ok).toBe(true);
    expect(enviarTexto).toHaveBeenCalledWith("5511", "Texto exato de hoje");
    expect(db.eventos).toHaveLength(0);
  });

  it("envia texto mesmo sem template nenhum configurado", async () => {
    db.templates = [];
    const r = await (await enviador()).enviar("5511", { fluxo: "comunicado", texto: "Aviso", params: [] });
    expect(r.ok).toBe(true);
    expect(enviarTexto).toHaveBeenCalledWith("5511", "Aviso");
  });
});
