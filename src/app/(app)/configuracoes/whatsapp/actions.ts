"use server";
import { revalidatePath } from "next/cache";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createServerSupabase } from "@/lib/supabase/server";
import { podeConfigurarWhatsapp } from "@/lib/clientes/permissoes";
import { cifrarDominio, decifrarDominio } from "@/lib/cripto/envelope";
import { statusConexao, type ZapiConfig } from "@/lib/whatsapp/zapi";

export type EstadoWa = { erro?: string; ok?: boolean; conectado?: boolean };

async function exigirAdmin() {
  const p = await getPerfilAtual();
  return p?.ativo && podeConfigurarWhatsapp(p.papel) ? p : null;
}

// Uso interno pelas actions de envio: decifra e devolve a config Z-API.
export async function carregarConfigZapi(): Promise<ZapiConfig | null> {
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("whatsapp_config")
    .select("instance, token_cifrado, client_token_cifrado")
    .eq("id", 1)
    .maybeSingle();
  if (!data?.instance || !data.token_cifrado || !data.client_token_cifrado) return null;
  try {
    return {
      instance: data.instance,
      token: (await decifrarDominio("whatsapp", data.token_cifrado)).toString("utf8"),
      clientToken: (await decifrarDominio("whatsapp", data.client_token_cifrado)).toString("utf8"),
    };
  } catch {
    return null;
  }
}

export async function salvarConfigWhatsapp(_prev: EstadoWa, fd: FormData): Promise<EstadoWa> {
  const perfil = await exigirAdmin();
  if (!perfil) return { erro: "Apenas admin." };
  const instance = String(fd.get("instance") ?? "").trim();
  const token = String(fd.get("token") ?? "").trim();
  const clientToken = String(fd.get("client_token") ?? "").trim();
  if (!instance || !token || !clientToken) return { erro: "Preencha instance, token e client-token." };
  const supabase = await createServerSupabase();
  let tokenCif: string, clientCif: string;
  try {
    tokenCif = await cifrarDominio("whatsapp", Buffer.from(token, "utf8"));
    clientCif = await cifrarDominio("whatsapp", Buffer.from(clientToken, "utf8"));
  } catch {
    return { erro: "Criptografia não configurada no servidor." };
  }
  const { error } = await supabase
    .from("whatsapp_config")
    .update({
      instance,
      token_cifrado: tokenCif,
      client_token_cifrado: clientCif,
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
