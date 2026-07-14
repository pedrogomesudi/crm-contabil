"use server";
import { revalidatePath } from "next/cache";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { podeEnviarEmail } from "@/lib/clientes/permissoes";
import { enviarEmail, type Anexo } from "@/lib/email/enviar";
import { validarEnvio, LIMITES } from "@/lib/email/validacao";
import { formatarData } from "@/lib/format";

export type AnexoTipo = "documento" | "obrigacao" | "nfse";
export type AnexoRef = { tipo: AnexoTipo; id: string };
export type Anexavel = { tipo: AnexoTipo; id: string; nome: string };
export type EmailView = {
  id: string;
  para: string;
  assunto: string;
  status: "ENVIADO" | "ERRO";
  erro: string | null;
  criadoEm: string;
  anexos: { nome: string }[];
};

const TIPOS = new Set<AnexoTipo>(["documento", "obrigacao", "nfse"]);

async function gate() {
  const p = await getPerfilAtual();
  return p?.ativo && podeEnviarEmail(p.papel) ? p : null;
}

// O que dá para anexar: o que já está no Storage sob o cadastro do cliente.
// A RLS escopa o contador ao próprio cliente — não filtramos por cliente_id à mão.
export async function listarAnexaveis(clienteId: string): Promise<Anexavel[]> {
  if (!(await gate())) return [];
  const supabase = await createServerSupabase();

  const { data: docs } = await supabase
    .from("documentos")
    .select("id, nome, caminho_storage")
    .eq("cliente_id", clienteId)
    .order("enviado_em", { ascending: false })
    .limit(50);

  const { data: guias } = await supabase
    .from("obrigacao_instancia")
    .select("id, competencia, comprovante_path, obrigacao:obrigacao_id(nome)")
    .eq("cliente_id", clienteId)
    .not("comprovante_path", "is", null)
    .order("competencia", { ascending: false })
    .limit(30);

  const { data: notas } = await supabase
    .from("nfse")
    .select("id, numero, danfse_path, competencia")
    .eq("cliente_id", clienteId)
    .not("danfse_path", "is", null)
    .order("criado_em", { ascending: false })
    .limit(30);

  const out: Anexavel[] = [];
  for (const d of docs ?? []) {
    if (d.caminho_storage) out.push({ tipo: "documento", id: d.id as string, nome: d.nome as string });
  }
  for (const g of guias ?? []) {
    const o = Array.isArray(g.obrigacao) ? g.obrigacao[0] : g.obrigacao;
    const nomeObr = (o as { nome?: string } | null)?.nome ?? "Guia";
    out.push({
      tipo: "obrigacao",
      id: g.id as string,
      nome: `${nomeObr} — ${formatarData(g.competencia as string)}`,
    });
  }
  for (const n of notas ?? []) {
    out.push({ tipo: "nfse", id: n.id as string, nome: `NFS-e ${(n.numero as string | null) ?? ""}`.trim() });
  }
  return out;
}

// Resolve o anexo PELO ID, com o supabase do usuário: a RLS prova que é do cliente.
// Aceitar `caminho_storage` do navegador seria path traversal disfarçado.
async function resolverAnexo(
  supabase: Awaited<ReturnType<typeof createServerSupabase>>,
  ref: AnexoRef,
  clienteId: string,
): Promise<{ caminho: string; nome: string } | null> {
  if (ref.tipo === "documento") {
    const { data } = await supabase
      .from("documentos")
      .select("nome, caminho_storage")
      .eq("id", ref.id)
      .eq("cliente_id", clienteId)
      .maybeSingle();
    if (!data?.caminho_storage) return null;
    return { caminho: data.caminho_storage as string, nome: data.nome as string };
  }
  if (ref.tipo === "obrigacao") {
    const { data } = await supabase
      .from("obrigacao_instancia")
      .select("comprovante_path, competencia")
      .eq("id", ref.id)
      .eq("cliente_id", clienteId)
      .maybeSingle();
    if (!data?.comprovante_path) return null;
    const caminho = data.comprovante_path as string;
    return { caminho, nome: caminho.split("/").pop() ?? "guia.pdf" };
  }
  const { data } = await supabase
    .from("nfse")
    .select("danfse_path, numero")
    .eq("id", ref.id)
    .eq("cliente_id", clienteId)
    .maybeSingle();
  if (!data?.danfse_path) return null;
  return { caminho: data.danfse_path as string, nome: `nfse-${(data.numero as string | null) ?? ref.id}.pdf` };
}

function tipoMime(nome: string): string {
  const ext = nome.toLowerCase().split(".").pop() ?? "";
  if (ext === "pdf") return "application/pdf";
  if (ext === "png") return "image/png";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "xml") return "application/xml";
  return "application/octet-stream";
}

export async function listarEmails(clienteId: string): Promise<EmailView[]> {
  const p = await getPerfilAtual();
  if (!p?.ativo) return [];
  const supabase = await createServerSupabase();
  // A RLS escopa: o contador só vê o histórico dos clientes dele.
  const { data } = await supabase
    .from("email_mensagem")
    .select("id, para, assunto, status, erro, anexos, criado_em")
    .eq("cliente_id", clienteId)
    .order("criado_em", { ascending: false })
    .limit(20);
  return (data ?? []).map((e) => ({
    id: e.id as string,
    para: e.para as string,
    assunto: e.assunto as string,
    status: e.status as "ENVIADO" | "ERRO",
    erro: (e.erro as string | null) ?? null,
    criadoEm: e.criado_em as string,
    anexos: (e.anexos as { nome: string }[] | null) ?? [],
  }));
}

export async function enviarEmailCliente(input: {
  clienteId: string;
  para: string;
  assunto: string;
  corpo: string;
  anexos: AnexoRef[];
}): Promise<{ ok?: boolean; erro?: string }> {
  const perfil = await gate();
  if (!perfil) return { erro: "Sem permissão." };

  const erroValidacao = validarEnvio({ para: input.para, assunto: input.assunto, corpo: input.corpo });
  if (erroValidacao) return { erro: erroValidacao };

  const supabase = await createServerSupabase();
  const admin = createAdminSupabase();

  const anexos: Anexo[] = [];
  let bytes = 0;
  for (const ref of input.anexos.slice(0, 10)) {
    if (!TIPOS.has(ref.tipo)) return { erro: "Anexo inválido." };
    const alvo = await resolverAnexo(supabase, ref, input.clienteId);
    if (!alvo) return { erro: "Anexo não encontrado neste cliente." };
    // Só baixa depois de a RLS ter provado a titularidade.
    const { data: arquivo, error } = await admin.storage.from("documentos").download(alvo.caminho);
    if (error || !arquivo) return { erro: `Falha ao ler o anexo "${alvo.nome}".` };
    const buf = Buffer.from(await arquivo.arrayBuffer());
    bytes += buf.byteLength;
    if (bytes > LIMITES.anexosBytes) return { erro: "Anexos acima de 10 MB." };
    anexos.push({ nome: alvo.nome, conteudo: buf, tipo: tipoMime(alvo.nome) });
  }

  const r = await enviarEmail({
    para: input.para.trim(),
    assunto: input.assunto.trim(),
    corpo: input.corpo.trim(),
    anexos,
  });

  // Registra SEMPRE — inclusive a falha. Um e-mail que não saiu não pode sumir.
  // email_mensagem não tem policy de INSERT: só o servidor grava.
  await admin.from("email_mensagem").insert({
    cliente_id: input.clienteId,
    para: input.para.trim(),
    assunto: input.assunto.trim(),
    corpo: input.corpo.trim(),
    anexos: anexos.map((a) => ({ nome: a.nome })),
    status: r.ok ? "ENVIADO" : "ERRO",
    erro: r.ok ? null : r.erro,
    enviado_por: perfil.id,
  });

  revalidatePath(`/clientes/${input.clienteId}`);
  return r.ok ? { ok: true } : { erro: r.erro };
}
