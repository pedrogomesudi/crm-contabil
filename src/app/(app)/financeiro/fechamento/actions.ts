"use server";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createServerSupabase } from "@/lib/supabase/server";
import { podeGerenciarFinanceiro } from "@/lib/financeiro/permissoes";
import { avaliarConferencia, type LinhaConferencia, type ResultadoConferencia } from "@/lib/financeiro/conferencia";

export type ItemConferencia = LinhaConferencia & ResultadoConferencia;

const casa = (a: number, b: number) => Math.round(a * 100) === Math.round(b * 100);

// Monta a conferência do fechamento de uma competência: cada cliente ativo com o estado das
// quatro peças (honorário, título, nota, boleto). Uma query por peça — sem N+1.
export async function carregarConferencia(competencia: string): Promise<ItemConferencia[]> {
  const perfil = await getPerfilAtual();
  if (!perfil?.ativo || !podeGerenciarFinanceiro(perfil.papel)) return [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(competencia)) return [];
  const supabase = await createServerSupabase();

  const { data: clientes } = await supabase
    .from("clientes")
    .select("id, razao_social, clientes_financeiro(honorario_mensal)")
    .is("excluido_em", null)
    .eq("status", "ativo")
    .order("razao_social");
  const cli = (clientes ?? []).map((c) => {
    const fin = Array.isArray(c.clientes_financeiro) ? c.clientes_financeiro[0] : c.clientes_financeiro;
    return {
      id: c.id as string,
      nome: (c.razao_social as string) ?? "—",
      honorario: fin?.honorario_mensal != null ? Number(fin.honorario_mensal) : null,
    };
  });
  const ids = cli.map((c) => c.id);
  if (ids.length === 0) return [];

  const { data: titRows } = await supabase
    .from("titulo")
    .select("id, cliente_id, valor")
    .eq("origem", "MENSALIDADE")
    .eq("competencia", competencia)
    .in("cliente_id", ids);
  const tituloPorCliente = new Map<string, { id: string; valor: number }>();
  for (const t of titRows ?? [])
    tituloPorCliente.set(t.cliente_id as string, { id: t.id as string, valor: Number(t.valor) });

  const { data: notaRows } = await supabase
    .from("nfse")
    .select("cliente_id, valor")
    .eq("status", "autorizada")
    .eq("competencia", competencia)
    .in("cliente_id", ids);
  const notasPorCliente = new Map<string, number[]>();
  for (const n of notaRows ?? []) {
    const arr = notasPorCliente.get(n.cliente_id as string) ?? [];
    arr.push(Number(n.valor));
    notasPorCliente.set(n.cliente_id as string, arr);
  }

  const tituloIds = [...tituloPorCliente.values()].map((t) => t.id);
  const boletoPorTitulo = new Map<string, number>();
  if (tituloIds.length) {
    const { data: bolRows } = await supabase
      .from("boleto")
      .select("titulo_id, valor")
      .in("titulo_id", tituloIds)
      .not("status", "in", "(cancelado,erro)");
    for (const b of bolRows ?? [])
      if (!boletoPorTitulo.has(b.titulo_id as string)) boletoPorTitulo.set(b.titulo_id as string, Number(b.valor));
  }

  return cli.map((c) => {
    const tit = tituloPorCliente.get(c.id) ?? null;
    const notas = notasPorCliente.get(c.id) ?? [];
    const notaCasa = tit != null && notas.some((v) => casa(v, tit.valor));
    const notaValor = notaCasa ? (tit as { valor: number }).valor : (notas[0] ?? null);
    const boleto = tit ? (boletoPorTitulo.get(tit.id) ?? null) : null;
    const linha: LinhaConferencia = {
      clienteId: c.id,
      cliente: c.nome,
      honorario: c.honorario,
      titulo: tit?.valor ?? null,
      temNota: notas.length > 0,
      notaValor,
      notaCasa,
      boleto,
    };
    return { ...linha, ...avaliarConferencia(linha) };
  });
}
