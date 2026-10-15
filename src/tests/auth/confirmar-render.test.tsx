import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// Espiões no cliente Supabase do servidor: o ponto central deste arquivo é provar que
// NENHUM deles é chamado ao renderizar a página (GET). Um link que se consome sozinho ao
// ser buscado por um pré-visualizador foi o que deixou uma usuária sem acesso em 15/10/2026.
const verifyOtp = vi.fn(async () => ({ error: null }));
const exchangeCodeForSession = vi.fn(async () => ({ error: null }));
const resetPasswordForEmail = vi.fn(async () => ({ error: null }));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: async () => ({ auth: { verifyOtp, exchangeCodeForSession, resetPasswordForEmail } }),
}));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

import ConfirmarPage, { metadata } from "@/app/auth/confirmar/page";

const render = (params: Record<string, string>) =>
  ConfirmarPage({ searchParams: Promise.resolve(params) }).then(renderToStaticMarkup);

beforeEach(() => {
  verifyOtp.mockClear();
  exchangeCodeForSession.mockClear();
  resetPasswordForEmail.mockClear();
});

describe("GET em /auth/confirmar não consome o token", () => {
  it("com token_hash válido, renderiza o botão e NÃO verifica o token", async () => {
    const html = await render({ token_hash: "abc123", type: "invite" });
    expect(verifyOtp).not.toHaveBeenCalled();
    expect(exchangeCodeForSession).not.toHaveBeenCalled();
    expect(html).toContain("Confirmar meu acesso");
  });

  it("com code (PKCE), também não troca a sessão só por renderizar", async () => {
    await render({ code: "pkce-xyz" });
    expect(exchangeCodeForSession).not.toHaveBeenCalled();
    expect(verifyOtp).not.toHaveBeenCalled();
  });

  it("leva o token adiante em campo oculto, para o POST consumir", async () => {
    const html = await render({ token_hash: "abc123", type: "recovery" });
    expect(html).toMatch(/<input[^>]*type="hidden"[^>]*value="abc123"/);
    expect(html).toMatch(/<input[^>]*type="hidden"[^>]*value="recovery"/);
  });

  it("não é indexável (o token vai na URL; buscador não deve guardá-la)", () => {
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });
});

describe("link ausente ou inválido", () => {
  it("sem parâmetro nenhum, explica e oferece pedir um novo link", async () => {
    const html = await render({});
    expect(html).toContain("Receber novo link");
    expect(html).not.toContain("Confirmar meu acesso");
  });

  it("type fora da lista aceita é tratado como link inválido", async () => {
    const html = await render({ token_hash: "abc123", type: "signup" });
    expect(html).toContain("Receber novo link");
    expect(html).not.toContain("Confirmar meu acesso");
  });

  it("token_hash sem type não vira botão de confirmar", async () => {
    const html = await render({ token_hash: "abc123" });
    expect(html).not.toContain("Confirmar meu acesso");
  });
});
