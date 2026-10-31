import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

// A CSP é montada em next.config.ts, fora do alcance do tsconfig — o teste lê o arquivo.
// A extração pega a LINHA da diretiva, não a primeira ocorrência da palavra: há um comentário
// mencionando "connect-src" acima, e casar com ele mediria o pedaço errado do arquivo.
const config = readFileSync("next.config.ts", "utf8");
const connectSrc = config.split("\n").find((l) => l.includes("connect-src 'self'")) ?? "(diretiva não encontrada)";

describe("connect-src da CSP", () => {
  it("autoriza o WebSocket do Supabase EXPLICITAMENTE", () => {
    // O tempo real do Atendimento é WebSocket. Pela especificação, uma origem `https:` deveria
    // autorizar `wss:` — mas o WebKit NÃO implementa essa equivalência. Sem o `wss:` explícito,
    // o iPhone bloqueia a conexão, o cliente do Supabase reconecta sem parar e a aba é
    // encerrada por memória. No Chrome funciona, o que escondeu o defeito por completo.
    expect(connectSrc, "connect-src sem wss: — o Atendimento morre no iOS").toContain("wss://");
  });

  it("mantém o Supabase e o próprio domínio liberados", () => {
    expect(connectSrc).toContain("'self'");
    expect(connectSrc).toContain("supabase.co");
  });

  it("não vira curinga: nada de connect-src *", () => {
    expect(connectSrc).not.toMatch(/connect-src\s+\*/);
    expect(connectSrc.trim()).not.toBe("*");
  });
});

describe("as defesas que não podem cair junto", () => {
  it("segue proibindo ser embutido em iframe e abrir objetos", () => {
    expect(config).toContain("frame-ancestors 'none'");
    expect(config).toContain("object-src 'none'");
    expect(config).toContain("form-action 'self'");
  });

  it("'unsafe-eval' só existe em desenvolvimento", () => {
    expect(config).toContain('isDev ? " \'unsafe-eval\'" : ""');
  });
});
