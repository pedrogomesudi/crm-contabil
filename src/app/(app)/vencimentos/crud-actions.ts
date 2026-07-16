"use server";
import { revalidatePath } from "next/cache";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createServerSupabase } from "@/lib/supabase/server";
import { podeGerenciarVencimentos } from "@/lib/clientes/permissoes";

export type EstadoVenc = { erro?: string; ok?: boolean };

async function permitido(): Promise<boolean> {
  const perfil = await getPerfilAtual();
  return Boolean(perfil?.ativo && podeGerenciarVencimentos(perfil.papel));
}

const DATA = /^\d{4}-\d{2}-\d{2}$/;

function texto(fd: FormData, chave: string, max = 160): string {
  return String(fd.get(chave) ?? "")
    .trim()
    .slice(0, max);
}

// Insere o novo registro e, se for renovação, desativa o antigo.
async function gravar(
  tabela: "certificado_digital" | "procuracao",
  clienteId: string,
  linha: Record<string, unknown>,
  substituiId: string,
): Promise<EstadoVenc> {
  const supabase = await createServerSupabase();
  const { error } = await supabase.from(tabela).insert({ cliente_id: clienteId, ...linha });
  if (error) {
    console.error(`salvar ${tabela}:`, error.code, error.message);
    return { erro: "Não foi possível salvar (sem permissão?)." };
  }
  if (substituiId) {
    await supabase.from(tabela).update({ ativo: false }).eq("id", substituiId).eq("cliente_id", clienteId);
  }
  revalidatePath(`/clientes/${clienteId}`);
  revalidatePath("/vencimentos");
  return { ok: true };
}

export async function salvarCertificado(clienteId: string, _prev: EstadoVenc, formData: FormData): Promise<EstadoVenc> {
  if (!(await permitido())) return { erro: "Sem permissão." };
  const tipo = texto(formData, "tipo", 2);
  if (tipo !== "A1" && tipo !== "A3") return { erro: "Tipo deve ser A1 ou A3." };
  const titular = texto(formData, "titular");
  if (!titular) return { erro: "Informe o titular." };
  const validade = texto(formData, "validade", 10);
  if (!DATA.test(validade)) return { erro: "Informe a validade." };
  const emissao = texto(formData, "emissao", 10);
  if (emissao && !DATA.test(emissao)) return { erro: "Data de emissão inválida." };
  if (emissao && emissao > validade) return { erro: "A emissão não pode ser depois da validade." };

  return gravar(
    "certificado_digital",
    clienteId,
    {
      tipo,
      titular,
      documento_titular: texto(formData, "documento_titular", 20) || null,
      emissao: emissao || null,
      validade,
      observacao: texto(formData, "observacao", 500) || null,
    },
    texto(formData, "substitui_id", 40),
  );
}

export async function salvarProcuracao(clienteId: string, _prev: EstadoVenc, formData: FormData): Promise<EstadoVenc> {
  if (!(await permitido())) return { erro: "Sem permissão." };
  const orgao = texto(formData, "orgao");
  if (!orgao) return { erro: "Informe o órgão." };
  const outorgante = texto(formData, "outorgante");
  if (!outorgante) return { erro: "Informe o outorgante." };
  const validade = texto(formData, "validade", 10);
  if (!DATA.test(validade)) return { erro: "Informe a validade." };
  const inicio = texto(formData, "inicio", 10);
  if (inicio && !DATA.test(inicio)) return { erro: "Data de início inválida." };
  if (inicio && inicio > validade) return { erro: "O início não pode ser depois da validade." };

  return gravar(
    "procuracao",
    clienteId,
    {
      orgao,
      outorgante,
      outorgado: texto(formData, "outorgado") || null,
      inicio: inicio || null,
      validade,
      observacao: texto(formData, "observacao", 500) || null,
    },
    texto(formData, "substitui_id", 40),
  );
}

async function desativar(
  tabela: "certificado_digital" | "procuracao",
  id: string,
  clienteId: string,
): Promise<EstadoVenc> {
  if (!(await permitido())) return { erro: "Sem permissão." };
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from(tabela)
    .update({ ativo: false })
    .eq("id", id)
    .eq("ativo", true)
    .select("id");
  if (error) return { erro: "Não foi possível desativar." };
  if (!data || data.length === 0) return { erro: "Registro não encontrado ou já inativo." };
  revalidatePath(`/clientes/${clienteId}`);
  revalidatePath("/vencimentos");
  return { ok: true };
}

export async function desativarCertificado(id: string, clienteId: string): Promise<EstadoVenc> {
  return desativar("certificado_digital", id, clienteId);
}
export async function desativarProcuracao(id: string, clienteId: string): Promise<EstadoVenc> {
  return desativar("procuracao", id, clienteId);
}
