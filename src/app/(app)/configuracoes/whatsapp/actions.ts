"use server";
import { revalidatePath } from "next/cache";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createServerSupabase } from "@/lib/supabase/server";
import { podeConfigurarWhatsapp } from "@/lib/clientes/permissoes";
import { cifrarDominio, decifrarDominio } from "@/lib/cripto/envelope";
import { adaptadorWhatsappAtivo } from "@/lib/whatsapp/ativo";
import { listarTemplatesMeta, type TemplateMeta } from "@/lib/whatsapp/templates-meta";
import { POLITICA } from "@/lib/whatsapp/politica-proativo";

export type EstadoWa = { erro?: string; ok?: boolean; conectado?: boolean };

const FLUXOS_VALIDOS = new Set(Object.keys(POLITICA));

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
  oficialWabaId: string;
  templatesPorFluxo: Record<string, { nome: string; idioma: string }>;
}> {
  const supabase = await createServerSupabase();
  const [{ data }, { data: tpls }] = await Promise.all([
    supabase
      .from("whatsapp_config")
      .select(
        "provedor, instance, token_cifrado, oficial_phone_number_id, oficial_token_cifrado, oficial_app_secret_cifrado, oficial_verify_token, oficial_waba_id",
      )
      .eq("id", 1)
      .maybeSingle(),
    supabase.from("whatsapp_template_fluxo").select("fluxo, nome, idioma"),
  ]);
  const templatesPorFluxo: Record<string, { nome: string; idioma: string }> = {};
  for (const t of (tpls ?? []) as { fluxo: string; nome: string; idioma: string }[]) {
    templatesPorFluxo[t.fluxo] = { nome: t.nome, idioma: t.idioma };
  }
  return {
    provedor: (data?.provedor as string) ?? "zapi",
    instance: (data?.instance as string) ?? "",
    zapiConfigurado: Boolean(data?.token_cifrado),
    oficialPhoneNumberId: (data?.oficial_phone_number_id as string) ?? "",
    oficialConfigurado: Boolean(data?.oficial_token_cifrado),
    oficialAppSecretConfigurado: Boolean(data?.oficial_app_secret_cifrado),
    oficialVerifyToken: (data?.oficial_verify_token as string) ?? "",
    oficialWabaId: (data?.oficial_waba_id as string) ?? "",
    templatesPorFluxo,
  };
}

// Lista os templates aprovados da conta na Meta. Precisa do WABA ID e de um token com
// permissão de gestão; sem isso a tela cai para a digitação manual do nome.
export async function listarTemplatesDisponiveis(): Promise<{ templates: TemplateMeta[] } | { erro: string }> {
  const perfil = await exigirAdmin();
  if (!perfil) return { erro: "Apenas admin." };
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("whatsapp_config")
    .select("oficial_waba_id, oficial_token_cifrado")
    .eq("id", 1)
    .maybeSingle();
  if (!data?.oficial_waba_id) return { erro: "Informe o WABA ID para listar os templates." };
  if (!data.oficial_token_cifrado) return { erro: "Configure o token da API oficial." };
  try {
    const token = (await decifrarDominio("whatsapp", data.oficial_token_cifrado as string)).toString("utf8");
    return await listarTemplatesMeta(data.oficial_waba_id as string, token);
  } catch {
    return { erro: "Criptografia do WhatsApp indisponível." };
  }
}

// Vincula (ou desvincula, com nome vazio) um template aprovado a um fluxo proativo.
export async function salvarTemplateFluxo(
  fluxo: string,
  nome: string,
  idioma: string,
): Promise<{ erro?: string }> {
  const perfil = await exigirAdmin();
  if (!perfil) return { erro: "Apenas admin." };
  if (!FLUXOS_VALIDOS.has(fluxo)) return { erro: "Fluxo inválido." };
  const supabase = await createServerSupabase();
  if (!nome.trim()) {
    const { error } = await supabase.from("whatsapp_template_fluxo").delete().eq("fluxo", fluxo);
    if (error) return { erro: "Não foi possível remover o template do fluxo." };
  } else {
    const { error } = await supabase.from("whatsapp_template_fluxo").upsert({
      fluxo,
      nome: nome.trim(),
      idioma: idioma.trim() || "pt_BR",
      atualizado_em: new Date().toISOString(),
    });
    if (error) return { erro: "Não foi possível salvar o template do fluxo." };
  }
  revalidatePath("/configuracoes/whatsapp");
  return {};
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
      // WABA ID não é segredo (é identificador da conta) — vai em texto, como o Phone Number ID.
      patch.oficial_waba_id = String(fd.get("oficial_waba_id") ?? "").trim() || null;
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
