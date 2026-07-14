"use server";
import { revalidatePath } from "next/cache";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createServerSupabase } from "@/lib/supabase/server";
import { podeGerenciarFinanceiro } from "@/lib/financeiro/permissoes";
import { processarRegua, type ResumoRegua } from "@/lib/whatsapp/regua-motor";

export type EtapaView = {
  id: string;
  nome: string;
  dias_offset: number;
  template: string;
  email_assunto: string | null;
  email_corpo: string | null;
  ativa: boolean;
  ordem: number;
};
export type EnvioView = {
  id: string;
  cliente: string;
  etapa: string;
  canal: "WhatsApp" | "E-mail";
  status: string;
  criado_em: string;
};
const ROTA = "/financeiro/regua-cobranca";

async function gate() {
  const p = await getPerfilAtual();
  return p?.ativo && podeGerenciarFinanceiro(p.papel) ? p : null;
}

export async function listarEtapas(): Promise<EtapaView[]> {
  if (!(await gate())) return [];
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("regua_etapa")
    .select("id, nome, dias_offset, template, email_assunto, email_corpo, ativa, ordem")
    .order("ordem");
  return (data ?? []) as EtapaView[];
}

export async function salvarEtapa(fd: FormData) {
  const perfil = await gate();
  if (!perfil) return { erro: "Sem permissão." };
  const id = String(fd.get("id") ?? "").trim();
  const nome = String(fd.get("nome") ?? "").trim();
  const dias_offset = Number(fd.get("dias_offset") ?? NaN);
  const template = String(fd.get("template") ?? "").trim();
  const ativa = fd.get("ativa") === "on";
  const ordem = Number(fd.get("ordem") ?? 0) || 0;
  if (!nome || !template || Number.isNaN(dias_offset)) return { erro: "Preencha nome, dias e template." };
  // Em branco, o e-mail reaproveita o texto do WhatsApp (ver conteudoEmail).
  const email_assunto = String(fd.get("email_assunto") ?? "").trim() || null;
  const email_corpo = String(fd.get("email_corpo") ?? "").trim() || null;
  const supabase = await createServerSupabase();
  const row = {
    nome,
    dias_offset,
    template,
    email_assunto,
    email_corpo,
    ativa,
    ordem,
    atualizado_em: new Date().toISOString(),
    atualizado_por: perfil.id,
  };
  const { error } = id
    ? await supabase.from("regua_etapa").update(row).eq("id", id)
    : await supabase.from("regua_etapa").insert({ ...row, criado_por: perfil.id });
  if (error) return { erro: "Falha ao salvar (offset já usado por outra etapa ativa?)." };
  revalidatePath(ROTA);
  return { ok: true };
}

export async function lerReguaAtiva(): Promise<boolean> {
  if (!(await gate())) return false;
  const supabase = await createServerSupabase();
  const { data } = await supabase.from("whatsapp_config").select("regua_ativa").eq("id", 1).maybeSingle();
  return Boolean(data?.regua_ativa);
}

export async function setReguaAtiva(ativa: boolean) {
  const perfil = await gate();
  if (!perfil) return { erro: "Sem permissão." };
  const supabase = await createServerSupabase();
  const { error } = await supabase.from("whatsapp_config").update({ regua_ativa: ativa }).eq("id", 1);
  if (error) return { erro: "Falha ao alterar." };
  revalidatePath(ROTA);
  return { ok: true };
}

export async function dispararReguaManual(): Promise<{ resumo?: ResumoRegua; erro?: string }> {
  if (!(await gate())) return { erro: "Sem permissão." };
  const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const resumo = await processarRegua(hoje, { forcarManual: true });
  revalidatePath(ROTA);
  return { resumo };
}

// Histórico dos DOIS canais, intercalado por data — a régua agora sai por WhatsApp ou por e-mail.
export async function historicoRegua(): Promise<EnvioView[]> {
  if (!(await gate())) return [];
  const supabase = await createServerSupabase();
  const consulta = (tabela: "whatsapp_mensagem" | "email_mensagem") =>
    supabase
      .from(tabela)
      .select("id, status, criado_em, clientes(razao_social), regua_etapa(nome)")
      .not("etapa_id", "is", null)
      .order("criado_em", { ascending: false })
      .limit(30);

  const [wa, em] = await Promise.all([consulta("whatsapp_mensagem"), consulta("email_mensagem")]);

  const mapear = (linhas: unknown[], canal: "WhatsApp" | "E-mail"): EnvioView[] =>
    (linhas as Record<string, unknown>[]).map((m) => {
      const cl = Array.isArray(m.clientes) ? m.clientes[0] : m.clientes;
      const et = Array.isArray(m.regua_etapa) ? m.regua_etapa[0] : m.regua_etapa;
      return {
        id: m.id as string,
        cliente: (cl as { razao_social?: string } | null)?.razao_social ?? "—",
        etapa: (et as { nome?: string } | null)?.nome ?? "—",
        canal,
        status: m.status as string,
        criado_em: m.criado_em as string,
      };
    });

  return [...mapear(wa.data ?? [], "WhatsApp"), ...mapear(em.data ?? [], "E-mail")]
    .sort((a, b) => b.criado_em.localeCompare(a.criado_em))
    .slice(0, 30);
}
