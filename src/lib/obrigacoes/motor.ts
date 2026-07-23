import type { SupabaseClient } from "@supabase/supabase-js";
import { sugerirPerfil } from "@/lib/onboarding/processo";
import { instanciasDaCompetencia, cutoffCompetencia, type ObrigacaoMatriz, type ClienteFiscal } from "./geracao";
import { regimeEm, type VigenciaRegime } from "./vigencia";
import { resolverFlag } from "./flags";

type Row = Record<string, unknown>;

function matrizDaLinha(r: Row): ObrigacaoMatriz {
  return {
    id: r.id as string,
    periodicidade: r.periodicidade as ObrigacaoMatriz["periodicidade"],
    aplicavelA: (r.aplicavel_a as string[] | null) ?? [],
    condicaoFlags: (r.condicao_flags as string[] | null) ?? [],
    condicaoModo: (r.condicao_modo as "any" | "all") ?? "any",
    ufs: (r.ufs as string[] | null) ?? [],
    cnaePrefixos: (r.cnae_prefixos as string[] | null) ?? [],
    vigenteDe: (r.vigente_de as string | null) ?? null,
    vigenteAte: (r.vigente_ate as string | null) ?? null,
    regra: {
      periodicidade: r.periodicidade as ObrigacaoMatriz["periodicidade"],
      vencDia: r.venc_dia as number,
      vencMesOffset: r.venc_mes_offset as number,
      vencMes: (r.venc_mes as number | null) ?? null,
      vencAnoOffset: r.venc_ano_offset as number,
      prazoInternoDiasUteis: r.prazo_interno_dias_uteis as number,
      antecipa: r.antecipa as boolean,
    },
  };
}

export async function gerarInstancias(
  supabase: SupabaseClient,
  ano: number,
  mes: number,
  clienteId?: string,
): Promise<{ candidatas: number; clientes: number }> {
  const { data: obrigRows } = await supabase.from("obrigacao").select("*").eq("ativa", true);
  const obrigacoes = (obrigRows ?? []).map(matrizDaLinha);
  if (obrigacoes.length === 0) return { candidatas: 0, clientes: 0 };

  let q = supabase
    .from("clientes")
    .select(
      "id, tipo_pessoa, regime_tributario, cnae, inscricao_estadual, inscricao_municipal, contador_id, endereco, competencia_inicial, data_inicio, flag_tem_folha, flag_contribui_icms, flag_contribui_iss, clientes_financeiro(qtd_funcionarios), regime_vigencia(vigente_de, regime)",
    )
    .is("excluido_em", null)
    .eq("status", "ativo");
  if (clienteId) q = q.eq("id", clienteId);
  const { data: clientes } = await q;

  const competencia = `${ano}-${String(mes).padStart(2, "0")}`;
  const linhas: Row[] = [];
  for (const cl of (clientes ?? []) as Row[]) {
    const finRaw = cl.clientes_financeiro;
    const fin = (Array.isArray(finRaw) ? finRaw[0] : finRaw) as { qtd_funcionarios?: number | null } | null;
    const qtd = fin?.qtd_funcionarios ?? null;
    // Regime VIGENTE na competência: a geração retroativa não pode aplicar o regime de hoje
    // a um mês antigo. Sem vigência, cai no regime atual do cadastro.
    const vigencias = ((cl.regime_vigencia as { vigente_de: string; regime: string }[] | null) ?? []).map(
      (v): VigenciaRegime => ({ vigenteDe: v.vigente_de, regime: v.regime }),
    );
    const regime = regimeEm(vigencias, competencia) ?? (cl.regime_tributario as string);
    const perfil = sugerirPerfil(cl.tipo_pessoa as string, regime, qtd);
    const endereco = (cl.endereco as { uf?: string } | null) ?? {};
    const c: ClienteFiscal = {
      perfil,
      uf: endereco.uf ?? null,
      cnae: (cl.cnae as string | null) ?? null,
      flags: {
        tem_folha: resolverFlag((cl.flag_tem_folha as boolean | null) ?? null, (qtd ?? 0) > 0),
        contribui_icms: resolverFlag((cl.flag_contribui_icms as boolean | null) ?? null, !!cl.inscricao_estadual),
        contribui_iss: resolverFlag((cl.flag_contribui_iss as boolean | null) ?? null, !!cl.inscricao_municipal),
      },
    };
    const cutoff = cutoffCompetencia(
      (cl.competencia_inicial as string | null) ?? null,
      (cl.data_inicio as string | null) ?? null,
    );
    for (const inst of instanciasDaCompetencia(obrigacoes, c, ano, mes)) {
      if (cutoff && inst.competencia < cutoff) continue; // não gera antes do início do contrato
      linhas.push({
        obrigacao_id: inst.obrigacaoId,
        cliente_id: cl.id,
        competencia: inst.competencia,
        vencimento_legal: inst.vencimentoLegal,
        vencimento_interno: inst.vencimentoInterno,
        responsavel_id: (cl.contador_id as string | null) ?? null,
      });
    }
  }
  if (linhas.length > 0) {
    const { error } = await supabase
      .from("obrigacao_instancia")
      .upsert(linhas, { onConflict: "obrigacao_id,cliente_id,competencia", ignoreDuplicates: true });
    if (error) throw new Error(error.message);
  }
  return { candidatas: linhas.length, clientes: (clientes ?? []).length };
}
