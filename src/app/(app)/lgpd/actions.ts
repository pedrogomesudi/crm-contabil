"use server";
import { revalidatePath } from "next/cache";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { converterPdfHtml } from "@/lib/contrato/gerar";
import { montarRelatorio, relatorioParaHtml, relatorioParaJson } from "@/lib/lgpd/relatorio";
import { patchAnonimizacao } from "@/lib/lgpd/anonimizacao";
import { vereditoRetencao, type SinaisFiscais } from "@/lib/lgpd/retencao";
import { TRATAMENTOS_SEED } from "@/lib/lgpd/tratamentos-seed";

const hoje = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

async function exigirAdmin() {
  const p = await getPerfilAtual();
  return p?.ativo && p.papel === "admin" ? p : null;
}

// ----------------------------------------------------------------- ROPA
export async function listarTratamentos() {
  if (!(await exigirAdmin())) return [];
  const supabase = await createServerSupabase();
  const { data } = await supabase.from("lgpd_tratamento").select("*").order("ordem");
  return data ?? [];
}

export async function semearTratamentos(): Promise<{ ok?: boolean; erro?: string }> {
  if (!(await exigirAdmin())) return { erro: "Apenas admin." };
  const supabase = await createServerSupabase();
  const { count } = await supabase.from("lgpd_tratamento").select("id", { count: "exact", head: true });
  if ((count ?? 0) > 0) return { erro: "Já há tratamentos cadastrados — apague antes de restaurar o padrão." };
  const { error } = await supabase.from("lgpd_tratamento").insert(TRATAMENTOS_SEED);
  if (error) return { erro: "Falha ao semear." };
  revalidatePath("/lgpd");
  return { ok: true };
}

export async function salvarTratamento(input: {
  id?: string;
  finalidade: string;
  categorias: string;
  base_legal: string;
  retencao: string;
  ativo: boolean;
  ordem: number;
}): Promise<{ ok?: boolean; erro?: string }> {
  if (!(await exigirAdmin())) return { erro: "Apenas admin." };
  if (!input.finalidade.trim()) return { erro: "Informe a finalidade." };
  const supabase = await createServerSupabase();
  const row = {
    finalidade: input.finalidade.trim(),
    categorias: input.categorias.trim(),
    base_legal: input.base_legal,
    retencao: input.retencao.trim() || null,
    ativo: input.ativo,
    ordem: input.ordem,
  };
  const { error } = input.id
    ? await supabase.from("lgpd_tratamento").update(row).eq("id", input.id)
    : await supabase.from("lgpd_tratamento").insert(row);
  if (error) return { erro: "Falha ao salvar o tratamento." };
  revalidatePath("/lgpd");
  return { ok: true };
}

export async function excluirTratamento(id: string): Promise<{ ok?: boolean; erro?: string }> {
  if (!(await exigirAdmin())) return { erro: "Apenas admin." };
  const supabase = await createServerSupabase();
  const { error } = await supabase.from("lgpd_tratamento").delete().eq("id", id);
  if (error) return { erro: "Falha ao excluir." };
  revalidatePath("/lgpd");
  return { ok: true };
}

// ----------------------------------------------------------------- Config
export async function salvarConfigLgpd(input: { retencaoMeses: number; encarregado: string }): Promise<{ ok?: boolean; erro?: string }> {
  if (!(await exigirAdmin())) return { erro: "Apenas admin." };
  if (!Number.isInteger(input.retencaoMeses) || input.retencaoMeses < 0 || input.retencaoMeses > 600) {
    return { erro: "Retenção inválida (0 a 600 meses)." };
  }
  const supabase = await createServerSupabase();
  const { error } = await supabase
    .from("escritorio_config")
    .update({ retencao_meses: input.retencaoMeses, lgpd_encarregado: input.encarregado.trim() || null })
    .eq("id", 1);
  if (error) return { erro: "Falha ao salvar." };
  revalidatePath("/lgpd");
  return { ok: true };
}

export async function listarSolicitacoes() {
  if (!(await exigirAdmin())) return [];
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("lgpd_solicitacao_titular")
    .select("id, tipo, status, criado_em, concluido_em, clientes(razao_social)")
    .order("criado_em", { ascending: false })
    .limit(100);
  return (data ?? []).map((s) => {
    const c = Array.isArray(s.clientes) ? s.clientes[0] : s.clientes;
    return {
      id: s.id as string,
      tipo: s.tipo as string,
      status: s.status as string,
      cliente: (c as { razao_social?: string } | null)?.razao_social ?? "—",
      criadoEm: s.criado_em as string,
      concluidoEm: (s.concluido_em as string | null) ?? null,
    };
  });
}

// ----------------------------------------------------------------- Relatório do titular
export async function gerarRelatorioTitular(
  clienteId: string,
  formato: "pdf" | "json",
): Promise<{ base64?: string; nome?: string; mime?: string; erro?: string }> {
  const perfil = await exigirAdmin();
  if (!perfil) return { erro: "Apenas admin." };

  const rel = await montarRelatorio(clienteId, hoje());
  if (!rel) return { erro: "Cliente não encontrado." };

  const admin = createAdminSupabase();
  // Registra o atendimento do direito de acesso (a prova de que foi cumprido).
  await admin.from("lgpd_solicitacao_titular").insert({
    cliente_id: clienteId,
    tipo: "acesso",
    status: "concluida",
    criado_por: perfil.id,
    concluido_em: new Date().toISOString(),
  });

  const slug = rel.clienteNome.replace(/[^a-zA-Z0-9]+/g, "-").slice(0, 40);
  if (formato === "json") {
    const buf = Buffer.from(relatorioParaJson(rel), "utf8");
    return { base64: buf.toString("base64"), nome: `dados-${slug}.json`, mime: "application/json" };
  }

  const html = relatorioParaHtml(rel);
  const pdf = await converterPdfHtml(html);
  if (pdf) return { base64: pdf.toString("base64"), nome: `dados-${slug}.pdf`, mime: "application/pdf" };
  // Degradação graciosa: sem Gotenberg, entrega o HTML (ainda é o relatório).
  return { base64: Buffer.from(html, "utf8").toString("base64"), nome: `dados-${slug}.html`, mime: "text/html" };
}

// ----------------------------------------------------------------- Anonimização
export async function anonimizarTitular(
  clienteId: string,
  confirmar: boolean,
): Promise<{ ok?: boolean; erro?: string; base64?: string; nome?: string; mime?: string }> {
  const perfil = await exigirAdmin();
  if (!perfil) return { erro: "Apenas admin." };
  if (!confirmar) return { erro: "Anonimização não confirmada (é irreversível)." };

  const admin = createAdminSupabase();

  const { data: cli } = await admin
    .from("clientes")
    .select("id, razao_social, clientes_financeiro(data_saida)")
    .eq("id", clienteId)
    .maybeSingle();
  if (!cli) return { erro: "Cliente não encontrado." };
  const fin = Array.isArray(cli.clientes_financeiro) ? cli.clientes_financeiro[0] : cli.clientes_financeiro;
  const dataSaida = (fin as { data_saida?: string } | null)?.data_saida ?? null;

  // Sinais fiscais: existe ao menos um registro sob guarda?
  const existe = async (tabela: string): Promise<boolean> => {
    const { count } = await admin.from(tabela).select("id", { count: "exact", head: true }).eq("cliente_id", clienteId);
    return (count ?? 0) > 0;
  };
  const sinais: SinaisFiscais = {
    temNfse: await existe("nfse"),
    temTitulo: await existe("titulo"),
    temDocumento: await existe("documentos"),
    temObrigacao: await existe("obrigacao_instancia"),
  };

  const { data: cfg } = await admin.from("escritorio_config").select("retencao_meses").eq("id", 1).maybeSingle();
  const meses = (cfg?.retencao_meses as number | null) ?? 60;
  const veredito = vereditoRetencao(sinais, dataSaida, meses, hoje());

  // Anonimiza os dados PESSOAIS não-fiscais — sempre. O esqueleto fiscal fica intacto.
  const patch = patchAnonimizacao();
  await admin.from("clientes").update(patch).eq("id", clienteId);

  // Usuários do portal daquele cliente: desativa e anonimiza nome/e-mail.
  const { data: portais } = await admin.from("usuarios").select("id").eq("cliente_id", clienteId);
  const anonimizadosPortal: string[] = [];
  for (const u of portais ?? []) {
    await admin.from("usuarios").update({ ativo: false, nome: "[anonimizado]" }).eq("id", u.id as string);
    anonimizadosPortal.push(u.id as string);
  }

  const anonimizado = { campos_cliente: Object.keys(patch), usuarios_portal: anonimizadosPortal.length };
  const retido = { esqueleto_fiscal: veredito.reter, motivo: veredito.motivo, sinais };

  await admin.from("lgpd_solicitacao_titular").insert({
    cliente_id: clienteId,
    tipo: "exclusao",
    status: "concluida",
    retido,
    anonimizado,
    criado_por: perfil.id,
    concluido_em: new Date().toISOString(),
  });

  revalidatePath(`/clientes/${clienteId}`);
  revalidatePath("/lgpd");

  // Resposta documentada ao titular.
  const html =
    "<html><head><meta charset='utf-8'></head><body style='font-family:sans-serif;color:#222'>" +
    "<h1 style='font-size:18px'>Resposta à solicitação de exclusão (LGPD)</h1>" +
    `<p style='font-size:12px'>Titular: ${(cli.razao_social as string) ?? "—"} · ${hoje()}</p>` +
    "<h2 style='font-size:14px'>Anonimizado</h2>" +
    `<p style='font-size:12px'>Dados pessoais não-fiscais: ${Object.keys(patch).join(", ")}. ` +
    `Usuários do portal desativados: ${anonimizadosPortal.length}.</p>` +
    "<h2 style='font-size:14px'>Retido</h2>" +
    `<p style='font-size:12px'>${veredito.motivo}</p>` +
    "<p style='font-size:11px;color:#888'>A retenção atende à obrigação legal de guarda (LGPD art. 7º, II e art. 16).</p>" +
    "</body></html>";
  const pdf = await converterPdfHtml(html);
  const buf = pdf ?? Buffer.from(html, "utf8");
  return {
    ok: true,
    base64: buf.toString("base64"),
    nome: `exclusao-titular.${pdf ? "pdf" : "html"}`,
    mime: pdf ? "application/pdf" : "text/html",
  };
}
