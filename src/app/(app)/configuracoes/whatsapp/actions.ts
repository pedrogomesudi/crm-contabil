"use server";
import { revalidatePath } from "next/cache";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createServerSupabase } from "@/lib/supabase/server";
import { podeConfigurarWhatsapp } from "@/lib/clientes/permissoes";
import { cifrarDominio } from "@/lib/cripto/envelope";
import { adaptadorWhatsappAtivo } from "@/lib/whatsapp/ativo";

export type EstadoWa = { erro?: string; ok?: boolean; conectado?: boolean };

async function exigirAdmin() {
  const p = await getPerfilAtual();
  return p?.ativo && podeConfigurarWhatsapp(p.papel) ? p : null;
}

export async function carregarConfigWhatsapp(): Promise<{
  provedor: string;
  instance: string;
  zapiConfigurado: boolean;
  oficialPhoneNumberId: string;
  oficialConfigurado: boolean;
  oficialAppSecretConfigurado: boolean;
  oficialVerifyToken: string;
}> {
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("whatsapp_config")
    .select(
      "provedor, instance, token_cifrado, oficial_phone_number_id, oficial_token_cifrado, oficial_app_secret_cifrado, oficial_verify_token",
    )
    .eq("id", 1)
    .maybeSingle();
  return {
    provedor: (data?.provedor as string) ?? "zapi",
    instance: (data?.instance as string) ?? "",
    zapiConfigurado: Boolean(data?.token_cifrado),
    oficialPhoneNumberId: (data?.oficial_phone_number_id as string) ?? "",
    oficialConfigurado: Boolean(data?.oficial_token_cifrado),
    oficialAppSecretConfigurado: Boolean(data?.oficial_app_secret_cifrado),
    oficialVerifyToken: (data?.oficial_verify_token as string) ?? "",
  };
}

export async function salvarConfigWhatsapp(_prev: EstadoWa, fd: FormData): Promise<EstadoWa> {
  const perfil = await exigirAdmin();
  if (!perfil) return { erro: "Apenas admin." };
  const provedor = String(fd.get("provedor") ?? "zapi");
  if (provedor !== "zapi" && provedor !== "oficial") return { erro: "Provedor inválido." };

  const patch: Record<string, unknown> = {
    provedor,
    atualizado_em: new Date().toISOString(),
    atualizado_por: perfil.id,
  };
  try {
    if (provedor === "zapi") {
      const instance = String(fd.get("instance") ?? "").trim();
      const token = String(fd.get("token") ?? "").trim();
      const clientToken = String(fd.get("client_token") ?? "").trim();
      if (!instance) return { erro: "Preencha o Instance ID." };
      patch.instance = instance;
      if (token) patch.token_cifrado = await cifrarDominio("whatsapp", Buffer.from(token, "utf8"));
      if (clientToken) patch.client_token_cifrado = await cifrarDominio("whatsapp", Buffer.from(clientToken, "utf8"));
    } else {
      const phoneNumberId = String(fd.get("oficial_phone_number_id") ?? "").trim();
      const token = String(fd.get("oficial_token") ?? "").trim();
      if (!phoneNumberId) return { erro: "Preencha o Phone Number ID." };
      patch.oficial_phone_number_id = phoneNumberId;
      if (token) patch.oficial_token_cifrado = await cifrarDominio("whatsapp", Buffer.from(token, "utf8"));
      const appSecret = String(fd.get("oficial_app_secret") ?? "").trim();
      const verifyToken = String(fd.get("oficial_verify_token") ?? "").trim();
      patch.oficial_verify_token = verifyToken || null;
      if (appSecret) patch.oficial_app_secret_cifrado = await cifrarDominio("whatsapp", Buffer.from(appSecret, "utf8"));
    }
  } catch {
    return { erro: "Criptografia não configurada no servidor." };
  }

  const supabase = await createServerSupabase();
  const { error } = await supabase.from("whatsapp_config").update(patch).eq("id", 1);
  if (error) return { erro: "Falha ao salvar." };
  revalidatePath("/configuracoes/whatsapp");
  return { ok: true };
}

export async function testarConexao(): Promise<EstadoWa> {
  if (!(await exigirAdmin())) return { erro: "Apenas admin." };
  const ativo = await adaptadorWhatsappAtivo();
  if ("erro" in ativo) return { erro: ativo.erro };
  const r = await ativo.adaptador.statusConexao();
  return r.erro ? { erro: r.erro } : { conectado: r.conectado };
}
