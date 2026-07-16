"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createServerSupabase } from "@/lib/supabase/server";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { clienteSchema } from "@/lib/validation/cliente";
import { formatarDocumento, parseValorBR } from "@/lib/format";
import { aplicarBusca } from "@/lib/clientes/busca";
import { normalizarFiltro, aplicarFiltroStatus } from "@/lib/clientes/filtroStatus";
import { exportar } from "@/app/(app)/exportar/actions";
import type {
  ArquivoExportado,
  FormatoExportacao,
  RelatorioExportavel,
} from "@/lib/exportar/tipos";
import { ehContadorValido } from "@/lib/clientes/contadores";
import { podeExcluirCliente } from "@/lib/clientes/permissoes";
import { normalizarExtensaoFinanceira } from "@/lib/financeiro/extensaoCliente";
import type { EstadoCliente, EstadoHonorario } from "./estados";

// Normaliza TODA string vazia para null (campos uuid/date/text opcionais). Os
// obrigatórios (razao_social/cpf_cnpj) nunca são "" (min(1)); enums nunca são "".
function limparVazios(d: Record<string, unknown>): Record<string, unknown> {
  const out = { ...d };
  for (const k of Object.keys(out)) {
    if (out[k] === "" || out[k] === undefined) out[k] = null;
  }
  return out;
}

// Monta o endereco (jsonb) a partir dos campos planos do form (normalizado).
function montarEndereco(formData: FormData): Record<string, string> | null {
  const campos = ["logradouro", "numero", "complemento", "bairro", "cidade", "uf", "cep"];
  const e: Record<string, string> = {};
  let temAlgum = false;
  for (const c of campos) {
    let v = String(formData.get(c) ?? "")
      .trim()
      .slice(0, 120);
    if (c === "uf") v = v.toUpperCase().slice(0, 2);
    if (v) {
      e[c] = v;
      temAlgum = true;
    }
  }
  return temAlgum ? e : null;
}

// Monta o representante (jsonb) a partir dos campos planos do form.
function montarRepresentante(formData: FormData): Record<string, string> | null {
  const campos = ["nacionalidade", "estado_civil", "profissao", "rg", "cpf"];
  const r: Record<string, string> = {};
  let temAlgum = false;
  for (const c of campos) {
    const v = String(formData.get(`rep_${c}`) ?? "")
      .trim()
      .slice(0, 80);
    if (v) {
      r[c] = v;
      temAlgum = true;
    }
  }
  return temAlgum ? r : null;
}

function lerEValidar(formData: FormData) {
  const dados = Object.fromEntries(formData) as Record<string, string>;
  if (dados.cpf_cnpj) dados.cpf_cnpj = dados.cpf_cnpj.replace(/\D/g, ""); // só dígitos (unicidade)
  if (dados.email) dados.email = dados.email.trim();
  return clienteSchema.safeParse(dados);
}

function mensagensErro(issues: { message: string }[]): string {
  return issues.map((i) => i.message).join(" • ");
}

export async function criarCliente(
  oportunidadeId: string | null,
  _prev: EstadoCliente,
  formData: FormData,
): Promise<EstadoCliente> {
  const parsed = lerEValidar(formData);
  if (!parsed.success) return { erro: mensagensErro(parsed.error.issues) };

  // contador_id, se informado, deve ser de um contador ativo (ACH-03).
  if (parsed.data.contador_id && !(await ehContadorValido(parsed.data.contador_id))) {
    return { erro: "Contador selecionado é inválido." };
  }

  const supabase = await createServerSupabase();
  // status não entra no payload de criação (DB default 'ativo'); criado_por e
  // contador_id (p/ contador) são forçados pelo trigger no banco.
  const payload = limparVazios(parsed.data);
  delete payload.status;
  const { data, error } = await supabase
    .from("clientes")
    .insert({
      ...payload,
      endereco: montarEndereco(formData),
      representante: montarRepresentante(formData),
    })
    .select("id");
  if (error) {
    if (error.code === "23505") {
      const { data: existente } = await supabase
        .from("clientes")
        .select("id, status")
        .eq("cpf_cnpj", parsed.data.cpf_cnpj)
        .maybeSingle();
      if (existente?.status === "inativo") {
        return { erro: "CPF/CNPJ já cadastrado em um cliente INATIVO.", reativarId: existente.id };
      }
      if (existente?.status === "ativo") {
        return { erro: "CPF/CNPJ já cadastrado em um cliente ativo." };
      }
      return { erro: "CPF/CNPJ já cadastrado. Procure um administrador." };
    }
    console.error("criarCliente:", error.code, error.message);
    return { erro: "Não foi possível salvar o cliente (sem permissão?)." };
  }
  if (!data || data.length === 0) {
    return { erro: "Não foi possível salvar o cliente (sem permissão)." };
  }
  const novoId = data[0]!.id as string;
  revalidatePath("/clientes");
  if (oportunidadeId) {
    await supabase
      .from("oportunidade")
      .update({ cliente_id: novoId, etapa: "ganho", atualizado_em: new Date().toISOString() })
      .eq("id", oportunidadeId);
    redirect(`/onboarding/${novoId}`);
  }
  redirect("/clientes?ok=1");
}

export async function atualizarCliente(
  clienteId: string,
  _prev: EstadoCliente,
  formData: FormData,
): Promise<EstadoCliente> {
  const parsed = lerEValidar(formData);
  if (!parsed.success) return { erro: mensagensErro(parsed.error.issues) };

  if (parsed.data.contador_id && !(await ehContadorValido(parsed.data.contador_id))) {
    return { erro: "Contador selecionado é inválido." };
  }

  // Token de concorrência obrigatório (vindo do hidden); sem ele, recusa para
  // não sobrescrever cegamente (ACH-02). O valor é o atualizado_em do render.
  const original = String(formData.get("atualizado_em") ?? "");
  if (!original) return { erro: "Recarregue a página e tente novamente." };

  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("clientes")
    .update({
      ...limparVazios(parsed.data),
      endereco: montarEndereco(formData),
      representante: montarRepresentante(formData),
    })
    .eq("id", clienteId)
    .eq("atualizado_em", original) // concorrência otimista (instante; PostgREST compara por valor)
    .select("id");
  if (error) {
    if (error.code === "23505") return { erro: "CPF/CNPJ já cadastrado em outro cliente." };
    console.error("atualizarCliente:", error.code, error.message);
    return { erro: "Não foi possível atualizar o cliente." };
  }
  if (!data || data.length === 0) {
    return {
      erro: "Não foi salvo: sem permissão ou o cliente foi alterado por outra pessoa. Recarregue a página.",
    };
  }
  revalidatePath(`/clientes/${clienteId}`);
  redirect("/clientes?ok=1");
}

export async function salvarHonorario(
  clienteId: string,
  _prev: EstadoHonorario,
  formData: FormData,
): Promise<EstadoHonorario> {
  const valor = parseValorBR(String(formData.get("honorario_mensal") ?? ""));
  if (valor !== null && (!Number.isFinite(valor) || valor < 0)) {
    return { erro: "Honorário inválido." };
  }
  const ext = normalizarExtensaoFinanceira(formData);
  if ("erro" in ext) return { erro: ext.erro };
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { erro: "Sessão expirada. Entre novamente." };

  // Sem concorrência otimista aqui: honorário é um único campo de baixa
  // contenção; o último a salvar vence (decisão de design). atualizado_por e
  // atualizado_em são preenchidos pelo trigger no banco (autoria não-forjável).
  const { data, error } = await supabase
    .from("clientes_financeiro")
    .upsert(
      { cliente_id: clienteId, honorario_mensal: valor, ...ext },
      { onConflict: "cliente_id" },
    )
    .select("cliente_id");
  if (error || !data || data.length === 0) {
    return { erro: "Sem permissão para alterar honorário." };
  }
  revalidatePath(`/clientes/${clienteId}`);
  return { ok: true };
}

// Soft delete: só admin (a RLS de UPDATE é ampla; a trava é aqui, server-side).
export async function excluirCliente(clienteId: string): Promise<{ erro?: string }> {
  const perfil = await getPerfilAtual();
  if (!podeExcluirCliente(perfil?.papel)) return { erro: "Sem permissão." };

  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("clientes")
    .update({ excluido_em: new Date().toISOString() })
    .eq("id", clienteId)
    .is("excluido_em", null) // não sobrescreve o carimbo de uma exclusão anterior
    .select("id");
  if (error) {
    console.error("excluirCliente:", error.code, error.message);
    return { erro: "Não foi possível excluir o cliente." };
  }
  if (!data || data.length === 0) return { erro: "Cliente não encontrado ou já excluído." };

  revalidatePath("/clientes");
  revalidatePath(`/clientes/${clienteId}`);
  return {};
}

export async function restaurarCliente(clienteId: string): Promise<{ erro?: string }> {
  const perfil = await getPerfilAtual();
  if (!podeExcluirCliente(perfil?.papel)) return { erro: "Sem permissão." };

  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("clientes")
    .update({ excluido_em: null })
    .eq("id", clienteId)
    .select("id");
  if (error) {
    console.error("restaurarCliente:", error.code, error.message);
    return { erro: "Não foi possível restaurar o cliente." };
  }
  if (!data || data.length === 0) return { erro: "Cliente não encontrado." };

  revalidatePath("/clientes");
  revalidatePath(`/clientes/${clienteId}`);
  return {};
}

// ------------------------------------------------------------------ Exportação
// A tela lista no máximo LIMITE clientes, mas exportar a carteira é outra coisa:
// aqui a mesma busca roda SEM limite. A query usa o cliente com RLS, então o
// arquivo nunca contém mais do que este usuário poderia ver na tela.
const SITUACAO: Record<string, string> = {
  ativo: "Ativo",
  em_constituicao: "Em constituição",
};

export async function exportarClientes(
  filtros: { q?: string; status?: string },
  formato: FormatoExportacao,
): Promise<ArquivoExportado | { erro: string }> {
  const perfil = await getPerfilAtual();
  if (!perfil?.ativo) return { erro: "Sem permissão." };

  const supabase = await createServerSupabase();
  const q = (filtros.q ?? "").slice(0, 100);
  let query = supabase
    .from("clientes")
    .select("razao_social, cpf_cnpj, regime_tributario, status, excluido_em")
    .order("atualizado_em", { ascending: false });
  query = aplicarBusca(query, q);
  query = aplicarFiltroStatus(query, normalizarFiltro(filtros.status));

  const { data, error } = await query;
  if (error) {
    console.error("exportarClientes:", error.code, error.message);
    return { erro: "Não foi possível exportar a lista." };
  }

  const relatorio: RelatorioExportavel = {
    titulo: "Lista de clientes",
    subtitulo: [q && `busca: ${q}`, normalizarFiltro(filtros.status) || "todos os status"]
      .filter(Boolean)
      .join(" · "),
    colunas: [
      { chave: "razao_social", rotulo: "Cliente", formato: "texto" },
      { chave: "cpf_cnpj", rotulo: "CPF/CNPJ", formato: "texto" },
      { chave: "regime_tributario", rotulo: "Regime", formato: "texto" },
      { chave: "situacao", rotulo: "Situação", formato: "texto" },
      { chave: "excluido", rotulo: "Excluído", formato: "texto" },
    ],
    linhas: (data ?? []).map((c) => ({
      razao_social: c.razao_social,
      cpf_cnpj: c.cpf_cnpj ? formatarDocumento(c.cpf_cnpj) : null,
      regime_tributario: c.regime_tributario,
      situacao: SITUACAO[c.status as string] ?? "Inativo",
      excluido: c.excluido_em ? "sim" : "não",
    })),
  };

  return exportar(relatorio, formato);
}
