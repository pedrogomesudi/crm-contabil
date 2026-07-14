"use server";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { podeGerenciarFinanceiro } from "@/lib/financeiro/permissoes";
import {
  custoDoApontamento,
  custoHoraNaData,
  mesesNoPeriodo,
  ordenarPorMargem,
  type LinhaRentab,
  type Vigencia,
} from "@/lib/timesheet/rentabilidade";

export type Relatorio = {
  linhas: LinhaRentab[];
  totais: { minutos: number; custo: number; recebido: number; contratado: number };
  semCustoCadastrado: boolean;
};

// Roda com service_role porque precisa cruzar o CUSTO (admin-only) com títulos e baixas.
// O gate de papel é aqui: admin e financeiro. O resultado é agregado POR CLIENTE — nunca
// expõe "quanto custa a hora do Fulano".
export async function relatorioRentabilidade(de: string, ate: string): Promise<Relatorio | null> {
  const perfil = await getPerfilAtual();
  if (!perfil?.ativo || !podeGerenciarFinanceiro(perfil.papel)) return null;

  const admin = createAdminSupabase();

  const { data: apont } = await admin
    .from("apontamento")
    .select("usuario_id, cliente_id, data, minutos")
    .gte("data", de)
    .lte("data", ate)
    .not("cliente_id", "is", null);

  const { data: custos } = await admin
    .from("colaborador_custo")
    .select("usuario_id, custo_hora, vigencia_inicio, vigencia_fim");

  const vigenciasPorUsuario = new Map<string, Vigencia[]>();
  for (const c of custos ?? []) {
    const lista = vigenciasPorUsuario.get(c.usuario_id as string) ?? [];
    lista.push({
      custoHora: Number(c.custo_hora),
      inicio: c.vigencia_inicio as string,
      fim: (c.vigencia_fim as string | null) ?? null,
    });
    vigenciasPorUsuario.set(c.usuario_id as string, lista);
  }

  const { data: clientes } = await admin
    .from("clientes")
    .select("id, razao_social, clientes_financeiro(honorario_mensal)")
    .is("excluido_em", null)
    .neq("status", "inativo");

  // Recebido: baixas NÃO estornadas de títulos a receber, pela data de recebimento.
  const { data: baixas } = await admin
    .from("baixa")
    .select("valor_recebido, estornada, data_recebimento, titulo(cliente_id, tipo)")
    .gte("data_recebimento", de)
    .lte("data_recebimento", ate);

  const recebidoPorCliente = new Map<string, number>();
  for (const b of baixas ?? []) {
    if (b.estornada) continue;
    const t = Array.isArray(b.titulo) ? b.titulo[0] : b.titulo;
    const tit = t as { cliente_id?: string; tipo?: string } | null;
    if (!tit?.cliente_id || tit.tipo !== "RECEBER") continue;
    recebidoPorCliente.set(
      tit.cliente_id,
      (recebidoPorCliente.get(tit.cliente_id) ?? 0) + Number(b.valor_recebido),
    );
  }

  const minutosPorCliente = new Map<string, number>();
  const custoPorCliente = new Map<string, number>();
  const semCustoPorCliente = new Set<string>();
  let semCustoCadastrado = false;

  for (const a of apont ?? []) {
    const clienteId = a.cliente_id as string;
    const minutos = a.minutos as number;
    minutosPorCliente.set(clienteId, (minutosPorCliente.get(clienteId) ?? 0) + minutos);

    // O custo é o VIGENTE NA DATA DO APONTAMENTO — não o de hoje.
    const vig = vigenciasPorUsuario.get(a.usuario_id as string) ?? [];
    const custoHora = custoHoraNaData(vig, a.data as string);
    if (custoHora === null) {
      // Custo zero não pode passar por "colaborador barato": sinaliza.
      semCustoPorCliente.add(clienteId);
      semCustoCadastrado = true;
    }
    custoPorCliente.set(clienteId, (custoPorCliente.get(clienteId) ?? 0) + custoDoApontamento(minutos, custoHora));
  }

  const meses = mesesNoPeriodo(de, ate);

  const linhas: LinhaRentab[] = (clientes ?? []).map((c) => {
    const id = c.id as string;
    const fin = Array.isArray(c.clientes_financeiro) ? c.clientes_financeiro[0] : c.clientes_financeiro;
    const honorario = Number((fin as { honorario_mensal?: number } | null)?.honorario_mensal ?? 0);
    const minutos = minutosPorCliente.get(id) ?? 0;
    return {
      clienteId: id,
      clienteNome: (c.razao_social as string) ?? "—",
      minutos,
      custo: custoPorCliente.get(id) ?? 0,
      recebido: recebidoPorCliente.get(id) ?? 0,
      contratado: honorario * meses,
      // Sem apontamento não é "cliente barato": é "ninguém apontou". A tela avisa.
      semApontamento: minutos === 0,
      semCusto: semCustoPorCliente.has(id),
    };
  });

  const totais = linhas.reduce(
    (acc, l) => ({
      minutos: acc.minutos + l.minutos,
      custo: acc.custo + l.custo,
      recebido: acc.recebido + l.recebido,
      contratado: acc.contratado + l.contratado,
    }),
    { minutos: 0, custo: 0, recebido: 0, contratado: 0 },
  );

  return { linhas: ordenarPorMargem(linhas), totais, semCustoCadastrado };
}
