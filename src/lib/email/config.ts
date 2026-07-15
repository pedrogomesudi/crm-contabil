import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { decifrarDominio } from "@/lib/cripto/envelope";

export type ConfigEmail = {
  provedor: "smtp" | "api";
  remetenteNome: string;
  remetenteEmail: string;
  smtp?: { host: string; porta: number; seguro: boolean; usuario: string; senha: string };
  api?: { provedor: "resend" | "sendgrid"; chave: string };
};

// Lê e DECIFRA a config. Só o servidor chama — a credencial nunca sai daqui.
export async function carregarConfig(): Promise<ConfigEmail | { erro: string }> {
  const admin = createAdminSupabase();
  const { data: c } = await admin
    .from("email_config")
    .select(
      "provedor, remetente_nome, remetente_email, smtp_host, smtp_porta, smtp_seguro, smtp_usuario, smtp_senha_cifrada, api_provedor, api_chave_cifrada",
    )
    .eq("id", 1)
    .maybeSingle();
  if (!c?.provedor || !c.remetente_email) return { erro: "E-mail não configurado." };

  const base = {
    remetenteNome: (c.remetente_nome as string | null) ?? (c.remetente_email as string),
    remetenteEmail: c.remetente_email as string,
  };

  if (c.provedor === "smtp") {
    if (!c.smtp_host || !c.smtp_senha_cifrada) return { erro: "SMTP incompleto." };
    return {
      ...base,
      provedor: "smtp",
      smtp: {
        host: c.smtp_host as string,
        porta: (c.smtp_porta as number | null) ?? 587,
        seguro: Boolean(c.smtp_seguro),
        usuario: (c.smtp_usuario as string | null) ?? "",
        senha: (await decifrarDominio("email", c.smtp_senha_cifrada as string)).toString("utf8"),
      },
    };
  }

  if (!c.api_provedor || !c.api_chave_cifrada) return { erro: "Chave de API ausente." };
  return {
    ...base,
    provedor: "api",
    api: {
      provedor: c.api_provedor as "resend" | "sendgrid",
      chave: (await decifrarDominio("email", c.api_chave_cifrada as string)).toString("utf8"),
    },
  };
}
