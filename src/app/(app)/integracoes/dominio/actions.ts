"use server";
import { revalidatePath } from "next/cache";
import { createServerSupabase } from "@/lib/supabase/server";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { lerXls } from "@/lib/dominio/biff";
import { detectarTipo } from "@/lib/dominio/detectar";
import { parseEmpresas } from "@/lib/dominio/parseEmpresas";
import { parseContratos } from "@/lib/dominio/parseContratos";
import { parseClientes } from "@/lib/dominio/parseClientes";
import { combinarFontes } from "@/lib/dominio/mapear";
import { reconciliarClientes, type ClienteExistente } from "@/lib/dominio/reconciliar";
import type { EmpresaDominio, ContatoDominio, ContratoDominio } from "@/lib/dominio/tipos";
import type { EstadoPrevia, EstadoAplicar } from "./estados";

const MEIA_HORA = 30 * 60 * 1000;
const PAPEIS_IMPORTACAO = ["admin", "assistente"] as const;

// Defesa em profundidade: server actions são endpoints públicos; o gate de papel
// da página não as protege. A barreira final é a RLS, mas re-checamos aqui.
async function papelAutorizado(): Promise<boolean> {
  const perfil = await getPerfilAtual();
  return !!perfil && (PAPEIS_IMPORTACAO as readonly string[]).includes(perfil.papel);
}

export async function gerarPrevia(_prev: EstadoPrevia, formData: FormData): Promise<EstadoPrevia> {
  if (!(await papelAutorizado())) return { erro: "Sem permissão para importar (apenas admin/assistente)." };
  const arquivos = formData.getAll("arquivos").filter((f): f is File => f instanceof File && f.size > 0);
  if (arquivos.length === 0) return { erro: "Selecione ao menos um arquivo .xls exportado do Domínio." };

  let empresas: EmpresaDominio[] = [];
  let contatos: ContatoDominio[] = [];
  let contratos: ContratoDominio[] = [];
  const nomes: string[] = [];
  for (const f of arquivos) {
    nomes.push(f.name);
    let folhas;
    try {
      folhas = lerXls(Buffer.from(await f.arrayBuffer()));
    } catch {
      return { erro: `Arquivo "${f.name}" não é um .xls válido do Domínio.` };
    }
    const folha = folhas[0];
    if (!folha) return { erro: `Arquivo "${f.name}" está vazio.` };
    const tipo = detectarTipo(folha);
    if (tipo === "empresas") empresas = parseEmpresas(folha);
    else if (tipo === "clientes") contatos = parseClientes(folha);
    else if (tipo === "contratos") contratos = parseContratos(folha);
    else return { erro: `Não reconheci o arquivo "${f.name}" (esperado Empresas, Clientes ou Contratos).` };
  }
  if (empresas.length === 0) return { erro: "É obrigatório enviar o arquivo de Empresas (cadastro-mestre)." };

  const normalizados = combinarFontes(empresas, contatos);

  const supabase = await createServerSupabase();
  await supabase.rpc("limpar_previas_expiradas");
  const { data: existentesRaw } = await supabase
    .from("clientes")
    .select("cpf_cnpj, razao_social, regime_tributario, status, email, telefone");
  const existentes = (existentesRaw ?? []) as ClienteExistente[];

  const itens = reconciliarClientes(normalizados, existentes);
  const contratosPorCodigo = new Map<string, ContratoDominio[]>();
  for (const c of contratos) {
    const k = String(c.codigoCliente);
    const lista = contratosPorCodigo.get(k) ?? [];
    lista.push(c);
    contratosPorCodigo.set(k, lista);
  }

  const resumo = { novos: 0, atualizados: 0, inalterados: 0, pendencias: 0, erros: 0 };
  for (const it of itens) {
    if (it.classe === "novo") resumo.novos++;
    else if (it.classe === "atualizado") resumo.atualizados++;
    else if (it.classe === "inalterado") resumo.inalterados++;
    else if (it.classe === "pendencia") resumo.pendencias++;
  }

  const { data: imp, error: impErr } = await supabase
    .from("importacoes")
    .insert({ status: "previa", arquivos: nomes, expira_em: new Date(Date.now() + MEIA_HORA).toISOString(), ...resumo })
    .select("id")
    .single();
  if (impErr || !imp) return { erro: "Não foi possível registrar a importação. Tente novamente." };

  // importacao_itens guarda só o cadastral (sem valores) — legível por assistente.
  const itensRows = itens.map((it) => ({
    importacao_id: imp.id,
    classe: it.classe,
    cpf_cnpj: it.cliente.cpf_cnpj,
    payload: { cliente: it.cliente, diff: it.diff },
  }));
  const { error: itErr } = await supabase.from("importacao_itens").insert(itensRows);
  if (itErr) return { erro: "Falha ao montar a prévia." };

  // Os valores de contrato/honorário vão para staging SEPARADO, com RLS do
  // financeiro (assistente não vê). Falha de permissão aqui não bloqueia o
  // cadastral — apenas significa que este papel não importa financeiro.
  const contratosRows = itens
    .filter((it) => it.cliente.dominio_codigo && contratosPorCodigo.has(it.cliente.dominio_codigo))
    .map((it) => ({
      importacao_id: imp.id,
      cpf_cnpj: it.cliente.cpf_cnpj,
      payload: contratosPorCodigo.get(it.cliente.dominio_codigo as string) ?? [],
    }));
  if (contratosRows.length) await supabase.from("importacao_contratos").insert(contratosRows);

  return { resumo: { importacaoId: imp.id, ...resumo } };
}

export async function aplicarImportacao(importacaoId: string): Promise<EstadoAplicar> {
  if (!(await papelAutorizado())) return { erro: "Sem permissão para importar (apenas admin/assistente)." };
  const supabase = await createServerSupabase();
  // Aplicação ATÔMICA via RPC: tudo-ou-nada numa única transação no Postgres,
  // com guarda contra reaplicação/expiração e o financeiro gateado por papel
  // (ver migration 0016). Erro => rollback completo (status volta a 'previa').
  const { data, error } = await supabase.rpc("aplicar_importacao", { p_id: importacaoId });
  if (error) {
    const indisponivel = /indispon|expirada|aplicada/i.test(error.message);
    return { erro: indisponivel ? "Prévia já aplicada ou expirada. Gere novamente." : "Falha ao aplicar a importação." };
  }
  revalidatePath("/clientes");
  const gravados = (data as { gravados?: number } | null)?.gravados ?? 0;
  return { ok: true, gravados };
}
