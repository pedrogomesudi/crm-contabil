"use server";
import { revalidatePath } from "next/cache";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { consultarCnpj } from "@/lib/receita/brasilapi";
import { detectarMudancas } from "@/lib/receita/monitoramento";

export type ClienteReceita = { cpf_cnpj: string; razao_social: string };
export type ResultadoReceita = { ok?: boolean; razao?: string | null; situacao?: string | null; erro?: string };

// Cadastral (razão social/endereço) => mesmo gate da importação: admin/assistente.
async function autorizado(): Promise<boolean> {
  const perfil = await getPerfilAtual();
  return !!perfil && (perfil.papel === "admin" || perfil.papel === "assistente");
}

// Lista os clientes com CNPJ (14 dígitos) — PF/CPF ficam de fora (sem consulta pública).
export async function listarClientesReceita(): Promise<ClienteReceita[]> {
  if (!(await autorizado())) return [];
  const admin = createAdminSupabase();
  const { data } = await admin
    .from("clientes")
    .select("cpf_cnpj, razao_social")
    .is("excluido_em", null)
    .order("razao_social");
  return (data ?? []).filter((c) => String(c.cpf_cnpj ?? "").replace(/\D/g, "").length === 14);
}

// Consulta um CNPJ na Receita (BrasilAPI) e atualiza razão social + endereço do
// cliente. Grava via service_role; o navegador orquestra o laço um a um.
export async function atualizarViaReceita(cpfCnpj: string): Promise<ResultadoReceita> {
  if (!(await autorizado())) return { erro: "Sem permissão (apenas admin/assistente)." };
  const doc = String(cpfCnpj ?? "").replace(/\D/g, "");
  if (doc.length !== 14) return { erro: "Não é um CNPJ." };

  const r = await consultarCnpj(doc);
  if (r.erro || !r.dados) return { erro: r.erro ?? "Sem dados." };

  const admin = createAdminSupabase();

  // Estado anterior persistido (para detectar mudança).
  const { data: atualCli } = await admin
    .from("clientes")
    .select("situacao_cadastral, optante_simples")
    .eq("cpf_cnpj", doc)
    .maybeSingle();

  const alertas = detectarMudancas(
    {
      situacao: (atualCli?.situacao_cadastral as string | null) ?? null,
      optanteSimples: (atualCli?.optante_simples as boolean | null) ?? null,
    },
    { situacao: r.dados.situacao, optanteSimples: r.dados.optanteSimples },
  );

  const patch: Record<string, unknown> = {
    situacao_cadastral: r.dados.situacao,
    optante_simples: r.dados.optanteSimples,
    situacao_verificada_em: new Date().toISOString(),
  };
  if (r.dados.razaoSocial) patch.razao_social = r.dados.razaoSocial;
  if (Object.keys(r.dados.endereco).length) patch.endereco = r.dados.endereco;

  const { data: cli, error } = await admin.from("clientes").update(patch).eq("cpf_cnpj", doc).select("id").single();
  if (error || !cli) return { erro: "Falha ao gravar os dados." };

  if (alertas.length) {
    await admin
      .from("receita_alerta")
      .insert(alertas.map((a) => ({ cliente_id: cli.id, tipo: a.tipo, de: a.de, para: a.para })));
  }
  revalidatePath("/clientes");
  return { ok: true, razao: r.dados.razaoSocial, situacao: r.dados.situacao };
}
