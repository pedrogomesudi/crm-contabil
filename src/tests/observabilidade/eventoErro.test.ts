import { describe, it, expect } from "vitest";
import { montarEventoErro } from "@/lib/observabilidade/eventoErro";

describe("montarEventoErro", () => {
  it("mapeia mensagem, rota, método, digest, tipo e contexto (só campos presentes)", () => {
    const linha = montarEventoErro(
      Object.assign(new Error("boom"), { digest: "abc", stack: "Error: boom\n at x" }),
      { path: "/financeiro", method: "POST" },
      {
        routerKind: "App Router",
        routePath: "/app/financeiro",
        routeType: "action",
        renderSource: "server-rendering",
      },
    );
    expect(linha.mensagem).toBe("boom");
    expect(linha.rota).toBe("/financeiro");
    expect(linha.metodo).toBe("POST");
    expect(linha.digest).toBe("abc");
    expect(linha.tipo_rota).toBe("action");
    expect(linha.stack).toContain("boom");
    expect(linha.contexto).toEqual({
      routerKind: "App Router",
      routePath: "/app/financeiro",
      renderSource: "server-rendering",
    });
  });

  it("campos ausentes viram null / (sem mensagem) e contexto vazio", () => {
    const linha = montarEventoErro({}, {}, {});
    expect(linha.mensagem).toBe("(sem mensagem)");
    expect(linha.rota).toBeNull();
    expect(linha.metodo).toBeNull();
    expect(linha.digest).toBeNull();
    expect(linha.tipo_rota).toBeNull();
    expect(linha.stack).toBeNull();
    expect(linha.contexto).toEqual({});
  });

  it("não lança com entrada nula/malformada e corta mensagem/stack", () => {
    const longa = "x".repeat(9000);
    const linha = montarEventoErro({ message: longa, stack: longa }, null, null);
    expect(linha.mensagem.length).toBe(2000);
    expect(linha.stack?.length).toBe(6000);
    expect(linha.rota).toBeNull();
  });
});
