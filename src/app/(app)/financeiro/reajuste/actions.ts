"use server";
import { revalidatePath } from "next/cache";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createServerSupabase } from "@/lib/supabase/server";
import { podeGerenciarFinanceiro } from "@/lib/financeiro/permissoes";
import { buscarSerie, SERIE_SGS } from "@/lib/reajuste/bacen";
import { variacaoSalarioMinimo, variacaoAcumulada } from "@/lib/reajuste/indice";
import { montarSimulacao, type ClienteReajuste, type LinhaReajuste } from "@/lib/reajuste/simulacao";

async function permitido(): Promise<boolean> {
  const perfil = await getPerfilAtual();
  return Boolean(perfil?.ativo && podeGerenciarFinanceiro(perfil.papel));
}

// Busca o percentual de cada índice usado, uma vez por índice. Falha de rede não derruba a
// simulação: o índice fica com 0 e a tela permite digitar.
async function percentuaisDosIndices(
  indices: Set<string>,
  ano: number,
): Promise<{ mapa: Record<string, number>; aviso?: string }> {
  const mapa: Record<string, number> = {};
  let houveFalha = false;
  const dInicial = `01/12/${ano - 1}`;
  const dFinalSM = `01/01/${ano}`;
  const dInicialAno = `01/01/${ano}`;
  const dFinalAno = `31/12/${ano}`;
  for (const idx of indices) {
    if (idx === "PERCENTUAL_FIXO" || idx === "SEM_REAJUSTE") continue;
    try {
      if (idx === "SALARIO_MINIMO") {
        const serie = await buscarSerie(SERIE_SGS.SALARIO_MINIMO, dInicial, dFinalSM);
        mapa[idx] = Math.round(variacaoSalarioMinimo(serie, ano) * 1000) / 1000;
      } else {
        const codigo = SERIE_SGS[idx as keyof typeof SERIE_SGS];
        if (!codigo) continue;
        const serie = await buscarSerie(codigo, dInicialAno, dFinalAno);
        mapa[idx] = Math.round(variacaoAcumulada(serie) * 1000) / 1000;
      }
    } catch {
      houveFalha = true; // índice fica ausente => 0 na simulação
    }
  }
  return {
    mapa,
    aviso: houveFalha
      ? "Alguns índices não puderam ser buscados no BACEN — informe o percentual manualmente."
      : undefined,
  };
}

export async function simularReajuste(
  anoBase: number,
): Promise<{ erro?: string; linhas?: LinhaReajuste[]; avisoBacen?: string }> {
  if (!(await permitido())) return { erro: "Sem permissão." };
  const supabase = await createServerSupabase();

  // Clientes elegíveis: ativos, com honorário, índice != SEM_REAJUSTE, e SEM reajuste no ano-base.
  const { data: cli } = await supabase
    .from("clientes")
    .select(
      "id, razao_social, clientes_financeiro!inner(honorario_mensal, indice_reajuste, percentual_reajuste), reajuste_item(ano_base)",
    )
    .is("excluido_em", null)
    .eq("status", "ativo");

  const clientes: ClienteReajuste[] = [];
  for (const c of cli ?? []) {
    const fin = Array.isArray(c.clientes_financeiro) ? c.clientes_financeiro[0] : c.clientes_financeiro;
    const honorario = Number(fin?.honorario_mensal ?? 0);
    const indice = String(fin?.indice_reajuste ?? "SALARIO_MINIMO");
    if (honorario <= 0 || indice === "SEM_REAJUSTE") continue;
    const jaReajustado = ((c.reajuste_item as { ano_base: number }[] | null) ?? []).some((r) => r.ano_base === anoBase);
    if (jaReajustado) continue;
    clientes.push({
      clienteId: c.id,
      nome: c.razao_social,
      valorAtual: honorario,
      indice,
      percentualFixo: fin?.percentual_reajuste != null ? Number(fin.percentual_reajuste) : null,
    });
  }

  const indices = new Set(clientes.map((c) => c.indice));
  const { mapa, aviso } = await percentuaisDosIndices(indices, anoBase);
  return { linhas: montarSimulacao(clientes, mapa), avisoBacen: aviso };
}

export async function aplicarReajusteLote(
  anoBase: number,
  itens: LinhaReajuste[],
): Promise<{ erro?: string; aplicados?: number }> {
  if (!(await permitido())) return { erro: "Sem permissão." };
  const supabase = await createServerSupabase();
  let aplicados = 0;
  for (const it of itens) {
    if (!it.marcada) continue;
    // O update do honorário dispara o trigger da Fatia B, que grava a vigência de janeiro.
    const { error: e1 } = await supabase
      .from("clientes_financeiro")
      .update({ honorario_mensal: it.valorNovo })
      .eq("cliente_id", it.clienteId);
    if (e1) continue;
    const { error: e2 } = await supabase.from("reajuste_item").insert({
      cliente_id: it.clienteId,
      ano_base: anoBase,
      indice: it.indice,
      percentual: it.percentual,
      valor_anterior: it.valorAtual,
      valor_novo: it.valorNovo,
    });
    if (!e2) aplicados += 1; // a trava única barra duplicata: e2 preenchido => já reajustado
  }
  revalidatePath("/financeiro/reajuste");
  return { aplicados };
}

export async function desfazerReajuste(itemId: string, clienteId: string): Promise<{ erro?: string }> {
  if (!(await permitido())) return { erro: "Sem permissão." };
  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc("desfazer_reajuste", { p_item_id: itemId });
  if (error) return { erro: "Não foi possível desfazer o reajuste." };
  revalidatePath(`/clientes/${clienteId}`);
  return {};
}
