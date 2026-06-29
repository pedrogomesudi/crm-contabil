"use server";
import { createServerSupabase } from "@/lib/supabase/server";
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

export async function gerarPrevia(_prev: EstadoPrevia, formData: FormData): Promise<EstadoPrevia> {
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
  if (impErr || !imp) return { erro: "Sem permissão para importar (admin/assistente)." };

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
  const supabase = await createServerSupabase();
  const { data: itens, error } = await supabase
    .from("importacao_itens")
    .select("classe, payload")
    .eq("importacao_id", importacaoId);
  if (error || !itens) return { erro: "Prévia expirada ou inacessível. Gere novamente." };

  // Contratos vêm do staging financeiro (admin/financeiro). Para assistente a
  // RLS devolve vazio: o cadastral é aplicado, o financeiro não — por design.
  const { data: contrRows } = await supabase
    .from("importacao_contratos")
    .select("cpf_cnpj, payload")
    .eq("importacao_id", importacaoId);
  const contratosPorCnpj = new Map<string, ContratoDominio[]>();
  for (const row of contrRows ?? []) {
    if (row.cpf_cnpj) contratosPorCnpj.set(row.cpf_cnpj, (row.payload as ContratoDominio[]) ?? []);
  }

  let gravados = 0;
  for (const it of itens) {
    if (it.classe !== "novo" && it.classe !== "atualizado") continue;
    const payload = it.payload as { cliente: Record<string, unknown> };
    const cliente = payload.cliente;
    const contratos = contratosPorCnpj.get(String(cliente.cpf_cnpj)) ?? [];
    const upsertCliente = {
      cpf_cnpj: cliente.cpf_cnpj,
      tipo_pessoa: cliente.tipo_pessoa,
      razao_social: cliente.razao_social,
      nome_fantasia: cliente.nome_fantasia,
      regime_tributario: cliente.regime_tributario,
      status: cliente.status,
      cnae: cliente.cnae,
      inscricao_estadual: cliente.inscricao_estadual,
      endereco: cliente.endereco,
      email: cliente.email,
      telefone: cliente.telefone,
      dominio_codigo: cliente.dominio_codigo,
      origem: "dominio",
      sincronizado_em: new Date().toISOString(),
      dominio_snapshot: cliente,
    };
    const { data: cli, error: cliErr } = await supabase
      .from("clientes")
      .upsert(upsertCliente, { onConflict: "cpf_cnpj" })
      .select("id")
      .single();
    if (cliErr || !cli) return { erro: `Falha ao gravar cliente ${String(cliente.cpf_cnpj)} (sem permissão?).` };
    gravados++;

    // honorário = soma dos contratos ativos "HONORARIOS CONTABEIS"
    const honorario = contratos
      .filter((c) => !c.encerradoEm && /honor/i.test(c.tipoContrato))
      .reduce((s, c) => s + (c.valorAtual ?? 0), 0);
    if (honorario > 0) {
      await supabase
        .from("clientes_financeiro")
        .upsert({ cliente_id: cli.id, honorario_mensal: honorario }, { onConflict: "cliente_id" });
      await supabase.from("contratos_dominio").delete().eq("cliente_id", cli.id);
      if (contratos.length) {
        await supabase.from("contratos_dominio").insert(
          contratos.map((c) => ({
            cliente_id: cli.id,
            dominio_codigo: String(c.codigoCliente),
            tipo_contrato: c.tipoContrato,
            emissao: c.emissao,
            inicio_contrato: c.inicioContrato,
            inicio_faturamento: c.inicioFaturamento,
            dia_vencimento: c.diaVencimento,
            encerrado_em: c.encerradoEm,
            valor_original: c.valorOriginal,
            valor_atual: c.valorAtual,
          })),
        );
      }
    }
  }

  await supabase.from("importacoes").update({ status: "aplicada", expira_em: null }).eq("id", importacaoId);
  return { ok: true, gravados };
}
