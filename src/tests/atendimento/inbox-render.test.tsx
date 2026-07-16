import { describe, it, expect, vi } from "vitest";

// Inbox importa server actions ("use server" → server-only), que o Vitest barra.
// Mockamos o módulo para o smoke renderizar só o markup inicial (efeitos não rodam no SSR).
vi.mock("@/app/(app)/atendimento/actions", () => ({
  listarConversas: vi.fn(),
  abrirConversa: vi.fn(),
  responder: vi.fn(),
  favoritarConversa: vi.fn(),
  marcarTodasLidas: vi.fn(),
  dadosContato: vi.fn(),
  iniciarConversa: vi.fn(),
}));

import { renderToStaticMarkup } from "react-dom/server";
import { Inbox } from "@/app/(app)/atendimento/Inbox";
import type { Conversa } from "@/lib/whatsapp/inbox";

const convs: Conversa[] = [
  {
    telefone: "111",
    cliente: "Moura Purcell",
    contato: "Breno",
    ultima: "oi",
    ultima_em: "2026-07-06T10:00:00Z",
    nao_lidas: 2,
    favorita: true,
    status: "aberta",
    atendenteId: null,
    atendenteNome: null,
  },
];

describe("Inbox", () => {
  it("renderiza a lista e as abas sem lançar", () => {
    const html = renderToStaticMarkup(<Inbox inicial={convs} />);
    expect(html).toContain("Atendimento");
    expect(html).toContain("Abertas");
    expect(html).toContain("Moura Purcell");
  });
  it("renderiza vazio sem lançar", () => {
    expect(() => renderToStaticMarkup(<Inbox inicial={[]} />)).not.toThrow();
  });
});
