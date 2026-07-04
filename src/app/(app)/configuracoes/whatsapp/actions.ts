"use server";
import { revalidatePath } from "next/cache";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createServerSupabase } from "@/lib/supabase/server";
import { podeConfigurarWhatsapp } from "@/lib/clientes/permissoes";
import { cifrar, decifrar } from "@/lib/nfse/cripto";
import { required } from "@/lib/env";
import { statusConexao, type ZapiConfig } from "@/lib/whatsapp/zapi";

export type EstadoWa = { erro?: string; ok?: boolean; conectado?: boolean };

async function exigirAdmin() {
  const p = await getPerfilAtual();
  return p?.ativo && podeConfigurarWhatsapp(p.papel) ? p : null;
}

// Uso interno pelas actions de envio: decifra e devolve a config Z-API.
export async function carregarConfigZapi(): Promise<ZapiConfig | null> {
  const chave = process.env.WHATSAPP_CRIPTO_KEY;
  if (!chave) return null;
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("whatsapp_config")
    .select("instance, token_cifrado, client_token_cifrado")
    .eq("id", 1)
    .maybeSingle();
  if (!data?.instance || !data.token_cifrado || !data.client_token_cifrado) return null;
  return {
    instance: data.instance,
    token: decifrar(data.token_cifrado, chave).toString("utf8"),
    clientToken: decifrar(data.client_token_cifrado, chave).toString("utf8"),
  };
}

export async function salvarConfigWhatsapp(_prev: EstadoWa, fd: FormData): Promise<EstadoWa> {
  const perfil = await exigirAdmin();
  if (!perfil) return { erro: "Apenas admin." };
  const instance = String(fd.get("instance") ?? "").trim();
  const token = String(fd.get("token") ?? "").trim();
  const clientToken = String(fd.get("client_token") ?? "").trim();
  if (!instance || !token || !clientToken) return { erro: "Preencha instance, token e client-token." };
  let chave: string;
  try {
    chave = required(process.env.WHATSAPP_CRIPTO_KEY, "WHATSAPP_CRIPTO_KEY");
  } catch {
    return { erro: "WHATSAPP_CRIPTO_KEY não configurada no servidor." };
  }
  const supabase = await createServerSupabase();
  const { error } = await supabase
    .from("whatsapp_config")
    .update({
      instance,
      token_cifrado: cifrar(Buffer.from(token, "utf8"), chave),
      client_token_cifrado: cifrar(Buffer.from(clientToken, "utf8"), chave),
      atualizado_em: new Date().toISOString(),
      atualizado_por: perfil.id,
    })
    .eq("id", 1);
  if (error) return { erro: "Falha ao salvar." };
  revalidatePath("/configuracoes/whatsapp");
  return { ok: true };
}

export async function testarConexao(): Promise<EstadoWa> {
  if (!(await exigirAdmin())) return { erro: "Apenas admin." };
  const cfg = await carregarConfigZapi();
  if (!cfg) return { erro: "Configure e salve as credenciais primeiro (e a WHATSAPP_CRIPTO_KEY)." };
  const r = await statusConexao(cfg);
  return r.erro ? { erro: r.erro } : { conectado: r.conectado };
}
