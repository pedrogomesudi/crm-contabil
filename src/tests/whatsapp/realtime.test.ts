import { describe, it, expect } from "vitest";
import { linhaParaMsg, rotearEvento, type LinhaMensagemRaw } from "@/lib/whatsapp/realtime";

const raw: LinhaMensagemRaw = {
  id: "m1",
  telefone: "5534988403020",
  texto: "oi",
  direcao: "IN",
  lida: false,
  criado_em: "2026-07-17T12:00:00Z",
  status: "recebida",
  midia_tipo: null,
  midia_path: null,
  midia_nome: null,
  midia_mime: null,
};

describe("linhaParaMsg", () => {
  it("converte snake_case da tabela para a MsgConversa da UI", () => {
    expect(linhaParaMsg(raw)).toEqual({
      id: "m1",
      telefone: "5534988403020",
      texto: "oi",
      direcao: "IN",
      lida: false,
      criado_em: "2026-07-17T12:00:00Z",
      status: "recebida",
      midiaTipo: null,
      midiaPath: null,
      midiaNome: null,
      midiaMime: null,
      cliente: null, // o Realtime não traz o join de cliente
    });
  });
  it("mapeia a mídia quando presente", () => {
    const comMidia = {
      ...raw,
      midia_tipo: "image",
      midia_path: "p/x.jpg",
      midia_nome: "x.jpg",
      midia_mime: "image/jpeg",
    };
    const m = linhaParaMsg(comMidia);
    expect(m.midiaTipo).toBe("image");
    expect(m.midiaPath).toBe("p/x.jpg");
  });
});

describe("rotearEvento", () => {
  it("mensagem da conversa aberta vai para a thread E marca a lista", () => {
    expect(rotearEvento(raw, "5534988403020", new Set())).toEqual({ paraThread: true, listaMudou: true });
  });
  it("mensagem de outra conversa só marca a lista", () => {
    expect(rotearEvento(raw, "5511999998888", new Set())).toEqual({ paraThread: false, listaMudou: true });
  });
  it("sem conversa aberta, só marca a lista", () => {
    expect(rotearEvento(raw, null, new Set())).toEqual({ paraThread: false, listaMudou: true });
  });
  it("id já na thread não vai de novo para a thread (dedup), mas ainda marca a lista", () => {
    expect(rotearEvento(raw, "5534988403020", new Set(["m1"]))).toEqual({ paraThread: false, listaMudou: true });
  });
});
