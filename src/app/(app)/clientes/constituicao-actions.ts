"use server";
import { revalidatePath } from "next/cache";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { podeCriarCliente } from "@/lib/clientes/permissoes";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { normalizarConstituicao, validarAtivacao } from "@/lib/clientes/constituicao";
import { iniciarProcesso } from "@/app/(app)/legalizacao/actions";

export async function criarEmpresaConstituicao(formData: FormData): Promise<{ id?: string; processoId?: string; erro?: string }> {
  const perfil = await getPerfilAtual();
  if (!perfil?.ativo || !podeCriarCliente(perfil.papel)) return { erro: "Sem permissão." };
  const dados = normalizarConstituicao(formData);
  if ("erro" in dados) return { erro: dados.erro };

  const supabase = await createServerSupabase();
  const contadorId = String(formData.get("contador_id") ?? "") || null;
  const { data: cli, error } = await supabase.from("clientes").insert({
    tipo_pessoa: "PJ",
    razao_social: dados.razaoSocial,
    nome_fantasia: dados.nomeFantasia,
    cpf_cnpj: null,
    regime_tributario: dados.regime,
    endereco: dados.endereco,
    observacoes: dados.observacoes,
    socios: dados.socios,
    representante: dados.representante,
    contador_id: contadorId,
    status: "em_constituicao",
  }).select("id").single();
  if (error || !cli) return { erro: "Falha ao criar a empresa (verifique os dados)." };
  const clienteId = cli.id as string;

  // Anexa o PDF do formulário ao acervo, se enviado (não aborta a criação se falhar).
  const pdf = formData.get("pdf");
  if (pdf instanceof File && pdf.size > 0 && pdf.size <= 10 * 1024 * 1024) {
    const buf = new Uint8Array(await pdf.arrayBuffer());
    const ehPdf = buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46;
    if (ehPdf) {
      const admin = createAdminSupabase();
      const caminho = `${clienteId}/${crypto.randomUUID()}-formulario-constituicao.pdf`;
      const up = await admin.storage.from("documentos").upload(caminho, buf, { contentType: "application/pdf" });
      if (!up.error) {
        await admin.from("documentos").insert({ cliente_id: clienteId, nome: "Formulário de constituição", tipo: "constituição", caminho_storage: caminho, enviado_por: perfil.id });
      }
    }
  }

  let processoId: string | undefined;
  const modeloId = String(formData.get("modelo_abertura") ?? "");
  const dataInicio = String(formData.get("data_inicio") ?? "");
  if (modeloId && dataInicio) {
    const r = await iniciarProcesso(clienteId, modeloId, dataInicio);
    if (r.id) processoId = r.id;
  }
  revalidatePath("/clientes");
  return { id: clienteId, processoId };
}

export async function ativarEmpresa(clienteId: string, formData: FormData): Promise<{ ok?: boolean; erro?: string }> {
  const perfil = await getPerfilAtual();
  if (!perfil?.ativo || !podeCriarCliente(perfil.papel)) return { erro: "Sem permissão." };
  const cpfCnpj = String(formData.get("cpf_cnpj") ?? "");
  const regime = String(formData.get("regime_tributario") ?? "");
  const v = validarAtivacao(cpfCnpj, regime);
  if (v.erro) return { erro: v.erro };
  const digits = cpfCnpj.replace(/\D/g, "");
  const supabase = await createServerSupabase();
  const { error } = await supabase.from("clientes").update({
    cpf_cnpj: digits,
    regime_tributario: regime,
    inscricao_estadual: String(formData.get("inscricao_estadual") ?? "").trim() || null,
    inscricao_municipal: String(formData.get("inscricao_municipal") ?? "").trim() || null,
    status: "ativo",
    atualizado_em: new Date().toISOString(),
  }).eq("id", clienteId);
  if (error) return { erro: "Falha ao ativar (CNPJ já cadastrado?)." };
  revalidatePath(`/clientes/${clienteId}`);
  return { ok: true };
}
