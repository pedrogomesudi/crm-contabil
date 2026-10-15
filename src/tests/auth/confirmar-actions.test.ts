import { describe, it, expect, vi, beforeEach } from "vitest";

process.env.NEXT_PUBLIC_SITE_URL = "https://app.exemplo.test";

const verifyOtp = vi.fn(async () => ({ error: null as { message: string } | null }));
const exchangeCodeForSession = vi.fn(async () => ({ error: null as { message: string } | null }));
const resetPasswordForEmail = vi.fn(async () => ({ error: null as { message: string } | null }));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: async () => ({ auth: { verifyOtp, exchangeCodeForSession, resetPasswordForEmail } }),
}));
const redirect = vi.fn((destino: string) => {
  throw new Error(`REDIRECT:${destino}`); // imita o next/navigation, que interrompe o fluxo
});
vi.mock("next/navigation", () => ({ redirect: (d: string) => redirect(d) }));

import { confirmarAcesso, solicitarNovoLink } from "@/app/auth/confirmar/actions";

const fd = (campos: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(campos)) f.set(k, v);
  return f;
};

beforeEach(() => {
  verifyOtp.mockClear().mockResolvedValue({ error: null });
  exchangeCodeForSession.mockClear().mockResolvedValue({ error: null });
  resetPasswordForEmail.mockClear().mockResolvedValue({ error: null });
  redirect.mockClear();
});

describe("confirmarAcesso", () => {
  it("consome o token e leva para definir a senha", async () => {
    await expect(confirmarAcesso({}, fd({ token_hash: "abc", type: "invite" }))).rejects.toThrow(
      "REDIRECT:/redefinir-senha",
    );
    expect(verifyOtp).toHaveBeenCalledWith({ type: "invite", token_hash: "abc" });
  });

  it("aceita o fluxo PKCE por code", async () => {
    await expect(confirmarAcesso({}, fd({ code: "pkce" }))).rejects.toThrow("REDIRECT:/redefinir-senha");
    expect(exchangeCodeForSession).toHaveBeenCalledWith("pkce");
  });

  it("recusa type fora da lista SEM chamar o Supabase", async () => {
    const r = await confirmarAcesso({}, fd({ token_hash: "abc", type: "signup" }));
    expect(verifyOtp).not.toHaveBeenCalled();
    expect(r.erro).toBeTruthy();
  });

  it("token expirado vira erro na própria tela, não redirect para o login", async () => {
    verifyOtp.mockResolvedValue({ error: { message: "Token has expired or is invalid" } });
    const r = await confirmarAcesso({}, fd({ token_hash: "velho", type: "recovery" }));
    expect(r.erro).toBeTruthy();
    expect(redirect).not.toHaveBeenCalled();
  });

  it("sem token nem code, não chama o Supabase", async () => {
    const r = await confirmarAcesso({}, fd({}));
    expect(verifyOtp).not.toHaveBeenCalled();
    expect(exchangeCodeForSession).not.toHaveBeenCalled();
    expect(r.erro).toBeTruthy();
  });
});

describe("solicitarNovoLink", () => {
  it("dispara a recuperação apontando de volta para /auth/confirmar", async () => {
    await solicitarNovoLink({}, fd({ email: "  Alguem@Exemplo.com " }));
    expect(resetPasswordForEmail).toHaveBeenCalledWith(
      "alguem@exemplo.com",
      expect.objectContaining({ redirectTo: expect.stringContaining("/auth/confirmar") }),
    );
  });

  it("a resposta é a MESMA existindo ou não o e-mail (não vira verificador de cadastro)", async () => {
    const ok = await solicitarNovoLink({}, fd({ email: "existe@exemplo.com" }));
    resetPasswordForEmail.mockResolvedValue({ error: { message: "User not found" } });
    const naoExiste = await solicitarNovoLink({}, fd({ email: "naoexiste@exemplo.com" }));
    expect(naoExiste).toEqual(ok);
    expect(ok.mensagem).toBeTruthy();
  });

  it("e-mail vazio não chama o Supabase", async () => {
    await solicitarNovoLink({}, fd({ email: "   " }));
    expect(resetPasswordForEmail).not.toHaveBeenCalled();
  });
});
