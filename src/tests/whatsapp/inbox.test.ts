import { describe, it, expect } from "vitest";
import {
  extrairMensagemZapi,
  extrairStatusZapi,
  marcaEntrega,
  extensaoPorMime,
  agruparConversas,
  horaMsg,
  separadorDia,
  filtrarConversas,
  contadores,
  type MsgConversa,
  type Conversa,
} from "@/lib/whatsapp/inbox";

const conv = (over: Partial<Conversa>): Conversa => ({
  telefone: "5534999990000",
  cliente: null,
  ultima: "oi",
  ultima_em: "2026-07-06T12:00:00.000Z",
  nao_lidas: 0,
  favorita: false,
  ...over,
});

describe("extrairMensagemZapi", () => {
  it("mensagem de texto recebida → objeto", () => {
    const r = extrairMensagemZapi({ phone: "5534999998888", fromMe: false, messageId: "M1", text: { message: "olá" } });
    expect(r).toEqual({ telefone: "5534999998888", texto: "olá", zId: "M1", midia: null });
  });
  it("aceita o campo message direto", () => {
    expect(extrairMensagemZapi({ phone: "553400", messageId: "M2", message: "oi" })?.texto).toBe("oi");
  });
  it("mídia não suportada (vídeo) → marcador", () => {
    expect(extrairMensagemZapi({ phone: "553400", messageId: "M3", video: { url: "x" } })?.texto).toBe("[mídia não suportada]");
  });
  it("fromMe (nossa saída) → null", () => {
    expect(extrairMensagemZapi({ phone: "553400", messageId: "M4", fromMe: true, text: { message: "eco" } })).toBeNull();
  });
  it("evento sem mensagem (status) → null", () => {
    expect(extrairMensagemZapi({ phone: "553400", messageId: "M5", status: "DELIVERED" })).toBeNull();
    expect(extrairMensagemZapi({ foo: "bar" })).toBeNull();
  });
});

describe("agruparConversas", () => {
  it("agrupa por telefone, conta não-lidas, ordena por recência", () => {
    const msgs: MsgConversa[] = [
      { id: "1", telefone: "551", texto: "a1", direcao: "IN", lida: false, criado_em: "2026-07-01T10:00:00Z", cliente: "ACME", status: "RECEBIDO", midiaTipo: null, midiaPath: null, midiaNome: null, midiaMime: null },
      { id: "2", telefone: "551", texto: "a2", direcao: "OUT", lida: true, criado_em: "2026-07-01T11:00:00Z", cliente: "ACME", status: "ENVIADO", midiaTipo: null, midiaPath: null, midiaNome: null, midiaMime: null },
      { id: "3", telefone: "552", texto: "b1", direcao: "IN", lida: false, criado_em: "2026-07-02T09:00:00Z", cliente: null, status: "RECEBIDO", midiaTipo: null, midiaPath: null, midiaNome: null, midiaMime: null },
    ];
    const convs = agruparConversas(msgs);
    expect(convs.map((c) => c.telefone)).toEqual(["552", "551"]); // 552 mais recente
    const c551 = convs.find((c) => c.telefone === "551")!;
    expect(c551).toMatchObject({ cliente: "ACME", ultima: "a2", nao_lidas: 1 });
  });
});

describe("horaMsg", () => {
  it("formata HH:MM 24h com zero-pad", () => {
    const d = new Date(2026, 6, 6, 0, 9, 0);
    expect(horaMsg(d.toISOString())).toBe("00:09");
  });
});

describe("separadorDia", () => {
  const hoje = new Date(2026, 6, 6, 10, 0, 0).toISOString();
  it("mesma data → hoje", () => {
    expect(separadorDia(new Date(2026, 6, 6, 8, 0).toISOString(), hoje)).toBe("hoje");
  });
  it("um dia antes → ontem", () => {
    expect(separadorDia(new Date(2026, 6, 5, 23, 0).toISOString(), hoje)).toBe("ontem");
  });
  it("mais antigo → dd/mm/aaaa", () => {
    expect(separadorDia(new Date(2026, 6, 1, 8, 0).toISOString(), hoje)).toBe("01/07/2026");
  });
});

describe("filtrarConversas", () => {
  const convs = [
    conv({ telefone: "111", cliente: "Moura Purcell", nao_lidas: 2, favorita: true }),
    conv({ telefone: "5534988887777", cliente: null, nao_lidas: 0, favorita: false }),
    conv({ telefone: "333", cliente: "Jessica", nao_lidas: 1, favorita: false }),
  ];
  it("aba todas sem busca → todas", () => {
    expect(filtrarConversas(convs, "todas", "").length).toBe(3);
  });
  it("aba nao_lidas → só com nao_lidas>0", () => {
    expect(filtrarConversas(convs, "nao_lidas", "").map((c) => c.telefone)).toEqual(["111", "333"]);
  });
  it("aba favoritos → só favoritas", () => {
    expect(filtrarConversas(convs, "favoritos", "").map((c) => c.telefone)).toEqual(["111"]);
  });
  it("busca por nome (case-insensitive)", () => {
    expect(filtrarConversas(convs, "todas", "moura").map((c) => c.telefone)).toEqual(["111"]);
  });
  it("busca por telefone", () => {
    expect(filtrarConversas(convs, "todas", "8888").map((c) => c.telefone)).toEqual(["5534988887777"]);
  });
});

describe("contadores", () => {
  it("conta por conversa (não por mensagem)", () => {
    const convs = [
      conv({ nao_lidas: 3, favorita: true }),
      conv({ nao_lidas: 0, favorita: false }),
      conv({ nao_lidas: 1, favorita: false }),
    ];
    expect(contadores(convs)).toEqual({ todas: 3, nao_lidas: 2, favoritos: 1 });
  });
});

describe("extrairStatusZapi", () => {
  it("SENT → ENVIADO com id via messageId", () => {
    expect(extrairStatusZapi({ status: "SENT", messageId: "M1", phone: "553400" })).toEqual({
      status: "ENVIADO",
      ids: ["M1"],
    });
  });
  it("RECEIVED → ENTREGUE com ids[]", () => {
    expect(extrairStatusZapi({ status: "RECEIVED", ids: ["A", "B"] })).toEqual({
      status: "ENTREGUE",
      ids: ["A", "B"],
    });
  });
  it("READ e PLAYED → LIDO", () => {
    expect(extrairStatusZapi({ status: "READ", ids: ["A"] })?.status).toBe("LIDO");
    expect(extrairStatusZapi({ status: "PLAYED", ids: ["A"] })?.status).toBe("LIDO");
  });
  it("id único via campo id", () => {
    expect(extrairStatusZapi({ status: "READ", id: "Z9" })).toEqual({ status: "LIDO", ids: ["Z9"] });
  });
  it("status desconhecido → null", () => {
    expect(extrairStatusZapi({ status: "TYPING", ids: ["A"] })).toBeNull();
  });
  it("sem status → null", () => {
    expect(extrairStatusZapi({ ids: ["A"] })).toBeNull();
  });
  it("sem ids → null", () => {
    expect(extrairStatusZapi({ status: "READ" })).toBeNull();
  });
});

describe("marcaEntrega", () => {
  it("IN → null", () => {
    expect(marcaEntrega("LIDO", "IN")).toBeNull();
  });
  it("mapeia cada status OUT", () => {
    expect(marcaEntrega("ENVIADO", "OUT")).toBe("enviado");
    expect(marcaEntrega("ENTREGUE", "OUT")).toBe("entregue");
    expect(marcaEntrega("LIDO", "OUT")).toBe("lido");
    expect(marcaEntrega("ERRO", "OUT")).toBe("erro");
  });
  it("status irreconhecível → null", () => {
    expect(marcaEntrega("RECEBIDO", "OUT")).toBeNull();
  });
});

describe("extrairMensagemZapi mídia", () => {
  it("imagem → midia image com url/mime/caption", () => {
    const r = extrairMensagemZapi({
      phone: "553400",
      messageId: "M1",
      image: { imageUrl: "https://z-api.io/x.jpg", mimeType: "image/jpeg", caption: "olha" },
    });
    expect(r).toEqual({
      telefone: "553400",
      zId: "M1",
      texto: "olha",
      midia: { tipo: "image", url: "https://z-api.io/x.jpg", mime: "image/jpeg", nome: null, caption: "olha" },
    });
  });
  it("áudio → midia audio, texto vazio", () => {
    const r = extrairMensagemZapi({ phone: "553400", messageId: "M2", audio: { audioUrl: "https://z/a.ogg", mimeType: "audio/ogg" } });
    expect(r?.midia).toEqual({ tipo: "audio", url: "https://z/a.ogg", mime: "audio/ogg", nome: null, caption: "" });
  });
  it("documento → midia document com nome", () => {
    const r = extrairMensagemZapi({
      phone: "553400",
      messageId: "M3",
      document: { documentUrl: "https://z/d.pdf", mimeType: "application/pdf", fileName: "nota.pdf" },
    });
    expect(r?.midia).toEqual({ tipo: "document", url: "https://z/d.pdf", mime: "application/pdf", nome: "nota.pdf", caption: "" });
  });
  it("mídia sem url → marcador, midia null", () => {
    const r = extrairMensagemZapi({ phone: "553400", messageId: "M4", image: { caption: "x" } });
    expect(r).toEqual({ telefone: "553400", texto: "[mídia não suportada]", zId: "M4", midia: null });
  });
  it("texto → midia null", () => {
    const r = extrairMensagemZapi({ phone: "553400", messageId: "M5", text: { message: "oi" } });
    expect(r).toEqual({ telefone: "553400", texto: "oi", zId: "M5", midia: null });
  });
});

describe("extensaoPorMime", () => {
  it("mapeia subtipos comuns", () => {
    expect(extensaoPorMime("image/png")).toBe("png");
    expect(extensaoPorMime("image/jpeg")).toBe("jpg");
    expect(extensaoPorMime("application/pdf")).toBe("pdf");
    expect(extensaoPorMime("audio/ogg; codecs=opus")).toBe("ogg");
    expect(extensaoPorMime("image/svg+xml")).toBe("svg");
  });
  it("sem subtipo → bin", () => {
    expect(extensaoPorMime("")).toBe("bin");
  });
});

describe("agruparConversas favoritos", () => {
  it("marca favorita quando o telefone está no set", () => {
    const msgs: MsgConversa[] = [
      { id: "x", telefone: "111", texto: "a", direcao: "IN", lida: true, criado_em: "2026-07-06T10:00:00Z", status: "RECEBIDO", midiaTipo: null, midiaPath: null, midiaNome: null, midiaMime: null },
    ];
    const [c] = agruparConversas(msgs, new Set(["111"]));
    expect(c!.favorita).toBe(true);
  });
  it("default sem favoritos → favorita false", () => {
    const msgs: MsgConversa[] = [
      { id: "x", telefone: "111", texto: "a", direcao: "IN", lida: true, criado_em: "2026-07-06T10:00:00Z", status: "RECEBIDO", midiaTipo: null, midiaPath: null, midiaNome: null, midiaMime: null },
    ];
    expect(agruparConversas(msgs)[0]!.favorita).toBe(false);
  });
});
