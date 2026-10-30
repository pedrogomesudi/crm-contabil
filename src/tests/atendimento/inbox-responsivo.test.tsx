import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

// Inbox é mestre/detalhe: duas colunas não cabem em 390px. No celular aparece uma de cada vez.
describe("Inbox no celular", () => {
  const src = readFileSync("src/app/(app)/atendimento/Inbox.tsx", "utf8");

  it("as duas colunas só convivem a partir de 768px", () => {
    expect(src).toMatch(/md:(flex|grid)/);
  });

  it("a lista se esconde quando há conversa aberta no celular", () => {
    expect(src).toMatch(/hidden md:(flex|block|grid)/);
  });
});
