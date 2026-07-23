import { describe, it, expect, vi, beforeEach } from "vitest";

// Troca de e-mail mexe em AUTENTICAÇÃO: se o Auth e a tabela saírem de sincronia, alguém
// entra com um endereço e a tela mostra outro. Estes testes fixam os ramos.

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  // O redirect do Next interrompe a execução lançando — o mock imita isso para que o
  // teste veja o destino E o fato de a função ter parado ali.
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));
vi.mock("@/lib/auth/perfil", () => ({
  getPerfilAtual: vi.fn(async () => ({ id: "eu", papel: "admin", ativo: true })),
}));

const updateUserById = vi.fn();
const db = {
  emailAtual: "antigo@x.com" as string | null,
  donoDoEmail: null as string | null, // id de quem já usa o e-mail novo
  falharUpdatePerfil: false,
  perfilAtualizadoPara: null as string | null,
};

vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabase: () => ({
    auth: { admin: { updateUserById } },
    from() {
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: () => chain,
        ilike: () => chain,
        maybeSingle: async () => ({ data: null }),
        update: (patch: { email?: string }) => ({
          eq: async () => {
            if (db.falharUpdatePerfil) return { error: { message: "boom" } };
            db.perfilAtualizadoPara = patch.email ?? null;
            return { error: null };
          },
        }),
      };
      // `select("email").eq(...).maybeSingle()` → e-mail atual do usuário
      // `select("id").ilike(...).maybeSingle()` → quem já usa o e-mail novo
      let campo = "";
      chain.select = (c: string) => {
        campo = c;
        return chain;
      };
      chain.maybeSingle = async () => {
        if (campo === "email") return { data: db.emailAtual ? { email: db.emailAtual } : null };
        return { data: db.donoDoEmail ? { id: db.donoDoEmail } : null };
      };
      return chain;
    },
  }),
}));

import { alterarEmail } from "@/app/(app)/usuarios/actions";

const form = (email: string) => {
  const f = new FormData();
  f.set("email", email);
  return f;
};

// A action sempre termina em redirect (que lança) — captura o destino.
const destino = async (id: string, email: string): Promise<string> => {
  try {
    await alterarEmail(id, form(email));
  } catch (e) {
    return String((e as Error).message).replace("REDIRECT:", "");
  }
  throw new Error("a action não redirecionou");
};

beforeEach(() => {
  updateUserById.mockReset().mockResolvedValue({ error: null });
  db.emailAtual = "antigo@x.com";
  db.donoDoEmail = null;
  db.falharUpdatePerfil = false;
  db.perfilAtualizadoPara = null;
});

describe("alterarEmail", () => {
  it("troca no Auth e na ficha, preservando o usuário", async () => {
    const url = await destino("u1", "adm@seusaldo.ai");
    expect(url).toBe("/usuarios?ok=email");
    // O id NÃO muda: é ele que sustenta o histórico (quem cadastrou, quem revisou…).
    expect(updateUserById).toHaveBeenCalledWith("u1", { email: "adm@seusaldo.ai", email_confirm: true });
    expect(db.perfilAtualizadoPara).toBe("adm@seusaldo.ai");
  });

  it("normaliza espaços e maiúsculas — e-mail é caixa-insensível", async () => {
    await destino("u1", "  ADM@SeuSaldo.AI  ");
    expect(updateUserById).toHaveBeenCalledWith("u1", { email: "adm@seusaldo.ai", email_confirm: true });
  });

  it("e-mail inválido não chega ao Auth", async () => {
    const url = await destino("u1", "não-é-email");
    expect(url).toBe("/usuarios?erro=email_invalido");
    expect(updateUserById).not.toHaveBeenCalled();
  });

  it("repetir o e-mail atual não faz nada", async () => {
    const url = await destino("u1", "ANTIGO@x.com");
    expect(url).toBe("/usuarios?ok=email");
    expect(updateUserById).not.toHaveBeenCalled();
  });

  it("e-mail de outro usuário é recusado antes de tocar no Auth", async () => {
    db.donoDoEmail = "outro";
    const url = await destino("u1", "ocupado@x.com");
    expect(url).toBe("/usuarios?erro=email_em_uso");
    expect(updateUserById).not.toHaveBeenCalled();
  });

  it("conflito relatado pelo Auth também vira 'em uso', não erro genérico", async () => {
    updateUserById.mockResolvedValue({ error: { message: "email address already registered" } });
    expect(await destino("u1", "ocupado@x.com")).toBe("/usuarios?erro=email_em_uso");
  });

  it("falha ao gravar a ficha avisa que o login JÁ mudou (estado parcial recuperável)", async () => {
    db.falharUpdatePerfil = true;
    const url = await destino("u1", "adm@seusaldo.ai");
    expect(url).toBe("/usuarios?erro=email_parcial");
    // O Auth foi alterado: repetir a operação conserta, e a mensagem diz isso ao operador.
    expect(updateUserById).toHaveBeenCalled();
  });
});
