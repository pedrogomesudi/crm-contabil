"use server";
import { revalidatePath } from "next/cache";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { podeGerenciarLegalizacao } from "@/lib/clientes/permissoes";
import { materializarEtapas, tipoComprovante, type EtapaTemplate } from "@/lib/legalizacao/processo";
import {
  rotuloTipo,
  type LegProcStatus,
  type LegEtapaStatus,
  type LegOrgao,
  type LegTipo,
} from "@/lib/legalizacao/tipos";
import { montarTermoHtml } from "@/lib/legalizacao/termo";
import { converterPdfHtml } from "@/lib/contrato/gerar";
import { sanitizarHtml } from "@/lib/comercial/gerar-proposta";
import { formatarEnderecoLinha } from "@/lib/comercial/proposta-template";

async function gate() {
  const p = await getPerfilAtual();
  if (!p?.ativo || !podeGerenciarLegalizacao(p.papel)) return null;
  return p;
}

export async function iniciarProcesso(
  clienteId: string,
  templateId: string,
  dataInicio: string,
): Promise<{ id?: string; erro?: string }> {
  if (!(await gate())) return { erro: "Sem permissão." };
  const supabase = await createServerSupabase();
  const { data: tpl } = await supabase
    .from("legalizacao_template")
    .select("id, tipo, nome")
    .eq("id", templateId)
    .maybeSingle();
  if (!tpl) return { erro: "Modelo não encontrado." };
  const { data: etapasTpl } = await supabase
    .from("legalizacao_template_etapa")
    .select("ordem, titulo, descricao, orgao, prazo_dias, responsavel_papel, anexo_obrigatorio, avisar_cliente")
    .eq("template_id", templateId)
    .order("ordem");
  const etapas: EtapaTemplate[] = (etapasTpl ?? []).map((e) => ({
    ordem: e.ordem as number,
    titulo: e.titulo as string,
    descricao: (e.descricao as string | null) ?? null,
    orgao: e.orgao as LegOrgao,
    prazoDias: (e.prazo_dias as number | null) ?? null,
    responsavelPapel: (e.responsavel_papel as string | null) ?? null,
    anexoObrigatorio: e.anexo_obrigatorio as boolean,
    avisarCliente: e.avisar_cliente as boolean,
  }));
  const tipo = tpl.tipo as LegTipo;
  const { data: proc, error } = await supabase
    .from("legalizacao_processo")
    .insert({ cliente_id: clienteId, template_id: templateId, tipo, titulo: rotuloTipo(tipo), data_inicio: dataInicio })
    .select("id")
    .single();
  if (error || !proc) return { erro: "Falha ao criar o processo (verifique a permissão sobre o cliente)." };
  const seeds = materializarEtapas(etapas, dataInicio);
  if (seeds.length > 0) {
    const linhas = seeds.map((s) => ({
      processo_id: proc.id,
      ordem: s.ordem,
      titulo: s.titulo,
      descricao: s.descricao,
      orgao: s.orgao,
      responsavel_papel: s.responsavelPapel,
      prazo: s.prazo,
      anexo_obrigatorio: s.anexoObrigatorio,
      avisar_cliente: s.avisarCliente,
    }));
    const { error: e2 } = await supabase.from("legalizacao_etapa").insert(linhas);
    if (e2) return { erro: "Falha ao criar as etapas." };
  }
  revalidatePath(`/legalizacao/${proc.id}`);
  revalidatePath(`/clientes/${clienteId}`);
  return { id: proc.id as string };
}

type EtapaPatch = {
  status?: LegEtapaStatus;
  protocolo?: string | null;
  protocoloEm?: string | null;
  prazo?: string | null;
  orgaoOutro?: string | null;
  observacao?: string | null;
  clienteAvisado?: boolean;
};

export async function atualizarEtapa(etapaId: string, patch: EtapaPatch): Promise<{ ok?: boolean; erro?: string }> {
  if (!(await gate())) return { erro: "Sem permissão." };
  const supabase = await createServerSupabase();
  const upd: Record<string, unknown> = {};
  if (patch.status !== undefined) upd.status = patch.status;
  if (patch.protocolo !== undefined) upd.protocolo = patch.protocolo;
  if (patch.protocoloEm !== undefined) upd.protocolo_em = patch.protocoloEm;
  if (patch.prazo !== undefined) upd.prazo = patch.prazo;
  if (patch.orgaoOutro !== undefined) upd.orgao_outro = patch.orgaoOutro;
  if (patch.observacao !== undefined) upd.observacao = patch.observacao;
  if (patch.clienteAvisado !== undefined)
    upd.cliente_avisado_em = patch.clienteAvisado ? new Date().toISOString() : null;
  if (Object.keys(upd).length === 0) return { ok: true };
  const { data: et } = await supabase.from("legalizacao_etapa").select("processo_id").eq("id", etapaId).maybeSingle();
  const { error } = await supabase.from("legalizacao_etapa").update(upd).eq("id", etapaId);
  if (error) return { erro: "Falha ao atualizar a etapa." };
  if (et) revalidatePath(`/legalizacao/${et.processo_id}`);
  return { ok: true };
}

export async function anexarComprovanteEtapa(
  etapaId: string,
  formData: FormData,
): Promise<{ ok?: boolean; erro?: string }> {
  if (!(await gate())) return { erro: "Sem permissão." };
  const arquivo = formData.get("comprovante") as File | null;
  if (!arquivo || arquivo.size === 0) return { erro: "Selecione um arquivo." };
  if (arquivo.size > 10 * 1024 * 1024) return { erro: "Arquivo acima de 10 MB." };
  const buf = new Uint8Array(await arquivo.arrayBuffer());
  const tipo = tipoComprovante(buf);
  if (!tipo) return { erro: "Envie um PDF, PNG ou JPG." };
  const supabase = await createServerSupabase();
  const { data: et } = await supabase.from("legalizacao_etapa").select("processo_id").eq("id", etapaId).maybeSingle();
  if (!et) return { erro: "Etapa não encontrada." };
  const path = `legalizacao/${et.processo_id}/${etapaId}.${tipo}`;
  const ct = tipo === "pdf" ? "application/pdf" : tipo === "png" ? "image/png" : "image/jpeg";
  const admin = createAdminSupabase();
  const { error: upErr } = await admin.storage.from("documentos").upload(path, buf, { contentType: ct, upsert: true });
  if (upErr) return { erro: "Falha ao enviar o comprovante." };
  const { error } = await supabase.from("legalizacao_etapa").update({ anexo_path: path }).eq("id", etapaId);
  if (error) return { erro: "Falha ao registrar o comprovante." };
  revalidatePath(`/legalizacao/${et.processo_id}`);
  return { ok: true };
}

export async function definirStatusProcesso(
  id: string,
  status: LegProcStatus,
): Promise<{ ok?: boolean; erro?: string }> {
  if (!(await gate())) return { erro: "Sem permissão." };
  const supabase = await createServerSupabase();
  const { data: proc } = await supabase.from("legalizacao_processo").select("cliente_id").eq("id", id).maybeSingle();
  const { error } = await supabase
    .from("legalizacao_processo")
    .update({ status, atualizado_em: new Date().toISOString() })
    .eq("id", id);
  if (error) return { erro: "Falha ao atualizar o processo." };
  revalidatePath(`/legalizacao/${id}`);
  if (proc) revalidatePath(`/clientes/${proc.cliente_id}`);
  return { ok: true };
}

export async function gerarTermoAcervo(
  processoId: string,
  input: { itens: string[]; data: string; responsavel: string | null },
): Promise<{ pdfBase64?: string; nome?: string; erro?: string }> {
  const perfil = await gate();
  if (!perfil) return { erro: "Sem permissão." };
  const supabase = await createServerSupabase();
  const { data: proc } = await supabase
    .from("legalizacao_processo")
    .select("id, cliente_id, tipo")
    .eq("id", processoId)
    .maybeSingle();
  if (!proc) return { erro: "Processo não encontrado." };
  const tipo = proc.tipo as string;
  if (tipo !== "transferencia_entrada" && tipo !== "transferencia_saida")
    return { erro: "O termo só se aplica a processos de transferência." };
  const { data: cli } = await supabase
    .from("clientes")
    .select("razao_social")
    .eq("id", proc.cliente_id as string)
    .maybeSingle();
  const { data: cfg } = await supabase
    .from("escritorio_config")
    .select("nome, cnpj, endereco")
    .eq("id", 1)
    .maybeSingle();

  const html = sanitizarHtml(
    montarTermoHtml({
      tipo: tipo as "transferencia_entrada" | "transferencia_saida",
      cliente: (cli?.razao_social as string) ?? "—",
      marca: {
        nome: (cfg?.nome as string | null) ?? null,
        cnpj: (cfg?.cnpj as string | null) ?? null,
        enderecoLinha: formatarEnderecoLinha((cfg?.endereco as Record<string, string> | null) ?? null),
      },
      itens: input.itens,
      data: input.data,
      responsavel: input.responsavel,
    }),
  );
  const pdf = await converterPdfHtml(html);
  if (!pdf) return { erro: "Conversão para PDF indisponível no momento. Tente novamente." };

  // Anexa ao acervo (não aborta o download se falhar).
  const admin = createAdminSupabase();
  const caminho = `${proc.cliente_id}/${crypto.randomUUID()}-termo-acervo.pdf`;
  const up = await admin.storage.from("documentos").upload(caminho, pdf, { contentType: "application/pdf" });
  if (!up.error) {
    await admin.from("documentos").insert({
      cliente_id: proc.cliente_id,
      nome: "Termo de acervo — NBC PG 01",
      tipo: "legalização",
      caminho_storage: caminho,
      enviado_por: perfil.id,
    });
  }
  revalidatePath(`/clientes/${proc.cliente_id}`);
  return { pdfBase64: pdf.toString("base64"), nome: `termo-acervo-${processoId.slice(0, 8)}.pdf` };
}
