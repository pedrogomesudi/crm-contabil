"use server";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createServerSupabase } from "@/lib/supabase/server";
import { podeGerenciarVencimentos } from "@/lib/clientes/permissoes";
import { hojeEmSaoPaulo } from "@/lib/vencimentos/hoje";
import { montarPainel, type ItemVencimento, type ResumoVencimentos } from "@/lib/vencimentos/alerta";
import { montarItens } from "@/lib/vencimentos/montar";

const VAZIO: { resumo: ResumoVencimentos; itens: ItemVencimento[] } = {
  resumo: { vencidos: 0, criticos: 0, alertas: 0, avisos: 0 },
  itens: [],
};

// O embed do PostgREST vem como objeto ou array de um elemento, conforme a cardinalidade.
function nomeDe(c: unknown): string {
  const cl = Array.isArray(c) ? c[0] : c;
  return (cl as { razao_social?: string } | null)?.razao_social ?? "—";
}

// Une as três fontes: registros próprios (editáveis) + validade do A1 da NFS-e (só leitura).
// Clientes inativos ou excluídos ficam de fora — certificado de quem saiu não é problema de ninguém.
export async function listarVencimentos(): Promise<{
  resumo: ResumoVencimentos;
  itens: ItemVencimento[];
}> {
  const perfil = await getPerfilAtual();
  if (!perfil?.ativo || !podeGerenciarVencimentos(perfil.papel)) return VAZIO;
  const supabase = await createServerSupabase();
  const hoje = hojeEmSaoPaulo();

  const [certs, procs, nfse] = await Promise.all([
    supabase
      .from("certificado_digital")
      .select("id, tipo, titular, validade, cliente_id, clientes!inner(razao_social, status, excluido_em)")
      .eq("ativo", true)
      .eq("clientes.status", "ativo")
      .is("clientes.excluido_em", null),
    supabase
      .from("procuracao")
      .select("id, orgao, outorgante, validade, cliente_id, clientes!inner(razao_social, status, excluido_em)")
      .eq("ativo", true)
      .eq("clientes.status", "ativo")
      .is("clientes.excluido_em", null),
    supabase.rpc("certificados_nfse_vencimento"),
  ]);

  // A RPC devolve só (cliente_id, validade, origem) — o nome vem de uma consulta à parte,
  // que também filtra clientes inativos/excluídos.
  const linhasNfse = (nfse.data ?? []) as {
    cliente_id: string | null;
    validade: string;
    origem: string;
  }[];
  const ids = linhasNfse.map((l) => l.cliente_id).filter((v): v is string => Boolean(v));
  const nomes = new Map<string, string>();
  if (ids.length) {
    const { data: cls } = await supabase
      .from("clientes")
      .select("id, razao_social")
      .in("id", ids)
      .eq("status", "ativo")
      .is("excluido_em", null);
    for (const cl of cls ?? []) nomes.set(cl.id, cl.razao_social);
  }

  const itens = montarItens(
    {
      certificados: (certs.data ?? []).map((c) => ({
        id: c.id,
        tipo: c.tipo,
        titular: c.titular,
        validade: c.validade,
        clienteId: c.cliente_id,
        clienteNome: nomeDe(c.clientes),
      })),
      procuracoes: (procs.data ?? []).map((p) => ({
        id: p.id,
        orgao: p.orgao,
        outorgante: p.outorgante,
        validade: p.validade,
        clienteId: p.cliente_id,
        clienteNome: nomeDe(p.clientes),
      })),
      nfse: linhasNfse
        .filter((l) => !l.cliente_id || nomes.has(l.cliente_id)) // some se o cliente saiu
        .map((l) => ({
          clienteId: l.cliente_id,
          validade: String(l.validade).slice(0, 10), // timestamptz -> YYYY-MM-DD
          origem: l.origem,
          clienteNome: l.cliente_id ? (nomes.get(l.cliente_id) ?? "—") : "Escritório",
        })),
    },
    hoje,
  );

  return montarPainel(itens);
}

// Badge do menu: só o que exige ação imediata.
export async function contarVencimentos(): Promise<number> {
  const { resumo } = await listarVencimentos();
  return resumo.vencidos + resumo.criticos;
}
