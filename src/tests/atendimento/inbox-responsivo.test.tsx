import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

// Inbox é mestre/detalhe: duas colunas não cabem em 390px. No celular aparece uma de cada vez.
// Mas o Inbox tem TRÊS colunas (lista, thread, painel do contato) de largura fixa — 20rem +
// minmax(0,1fr) + 18rem. A 768px (md) só cabem lista + thread lado a lado; o painel do contato
// só cabe a partir de 1024px (lg). Por isso o arquivo usa DOIS breakpoints com papéis distintos:
// md para a troca mestre/detalhe, lg só para a 3ª coluna. Não uniformizar os dois.
describe("Inbox no celular", () => {
  const src = readFileSync("src/app/(app)/atendimento/Inbox.tsx", "utf8");

  it("as duas colunas (lista + thread) só convivem a partir de 768px", () => {
    expect(src).toMatch(/md:(flex|grid)/);
  });

  it("a lista se esconde quando há conversa aberta no celular", () => {
    expect(src).toMatch(/hidden md:(flex|block|grid)/);
  });

  it("o grid reserva só duas colunas em md — a 3ª (contato) entra depois, em lg", () => {
    // md: lista + thread (duas larguras no template). lg: lista + thread + painel do contato.
    expect(src).toMatch(/md:grid-cols-\[20rem_minmax\(0,1fr\)\]/);
    expect(src).toMatch(/lg:grid-cols-\[20rem_minmax\(0,1fr\)_18rem\]/);
  });

  it("o painel do contato usa lg, não md — não é a mesma troca da lista/thread", () => {
    // Garante a distinção de papéis: se alguém "uniformizar" os breakpoints trocando o lg do
    // painel por md, o painel passaria a tentar caber ao lado de lista+thread entre 768–1024px,
    // onde não há espaço (608px fixos contra ~544px disponíveis descontada a sidebar).
    expect(src).toMatch(/hidden min-h-0 overflow-y-auto border-l border-linha bg-white lg:block/);
    expect(src).not.toMatch(/hidden min-h-0 overflow-y-auto border-l border-linha bg-white md:block/);
  });
});
