import { describe, it, expect } from "vitest";
import { montarErroCliente, LIMITE_MENSAGEM, LIMITE_STACK } from "@/lib/observabilidade/erroCliente";

describe("montarErroCliente", () => {
  it("guarda mensagem, stack e rota do navegador", () => {
    const l = montarErroCliente({ message: "boom", stack: "em Inbox\nem React" }, "/atendimento", "Mozilla/5.0");
    expect(l.mensagem).toBe("boom");
    expect(l.stack).toContain("em Inbox");
    expect(l.rota).toBe("/atendimento");
    expect(l.tipo_rota).toBe("cliente");
  });

  it("marca a origem como navegador — é o que distingue do erro de servidor", () => {
    const l = montarErroCliente({ message: "x" }, "/x", "UA");
    expect(l.contexto).toMatchObject({ origem: "navegador", userAgent: "UA" });
  });

  it("erro sem mensagem não vira linha vazia", () => {
    expect(montarErroCliente({}, "/x", "UA").mensagem).toBe("(sem mensagem)");
    expect(montarErroCliente({ message: "" }, "/x", "UA").mensagem).toBe("(sem mensagem)");
  });

  it("corta mensagem e stack — o navegador é entrada não confiável, e a tabela não é depósito", () => {
    const l = montarErroCliente({ message: "a".repeat(9000), stack: "b".repeat(99000) }, "/x", "UA");
    expect(l.mensagem.length).toBe(LIMITE_MENSAGEM);
    expect(l.stack!.length).toBe(LIMITE_STACK);
  });

  it("corta também o user-agent e a rota", () => {
    const l = montarErroCliente({ message: "x" }, "/" + "r".repeat(900), "u".repeat(900));
    expect(l.rota!.length).toBeLessThanOrEqual(300);
    expect((l.contexto.userAgent as string).length).toBeLessThanOrEqual(300);
  });

  it("preserva o digest quando o erro vem de Server Component", () => {
    expect(montarErroCliente({ message: "x", digest: "abc123" }, "/x", "UA").digest).toBe("abc123");
    expect(montarErroCliente({ message: "x" }, "/x", "UA").digest).toBeNull();
  });

  it("campo de tipo errado não derruba a captura — ela roda quando tudo já deu errado", () => {
    const l = montarErroCliente({ message: 42 as unknown as string, stack: {} as unknown as string }, "/x", "UA");
    expect(l.mensagem).toBe("(sem mensagem)");
    expect(l.stack).toBeNull();
  });
});
