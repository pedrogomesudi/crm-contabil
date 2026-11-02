"use server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { podeVerHonorario } from "@/lib/clientes/permissoes";
import { emailsDeEnvio, telefonesDeEnvio } from "@/lib/clientes/contatos-envio";
import { canaisParaEnvio } from "@/lib/nfse/envio-canais";
import { conferirHonorarios, type ClienteConferencia, type EntradaConferencia } from "@/lib/nfse/conferencia";
import { competenciaBR } from "@/lib/whatsapp/notas-envio";
import type { RelatorioExportavel } from "@/lib/exportar/tipos";

async function gate() {
  const p = await getPerfilAtual();
  return p?.ativo && podeVerHonorario(p.papel) ? p : null;
}

// Carrega os dois lados da competência e devolve a conferência já classificada.
// Entram os clientes que têm título de mensalidade OU nota autorizada: quem só tem um dos dois
// é exatamente o que a tela precisa mostrar.
export async function conferenciaDaCompetencia(competencia: string): Promise<EntradaConferencia | { erro: string }> {
  if (!(await gate())) return { erro: "Sem permissão." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(competencia)) return { erro: "Competência inválida." };
  const admin = createAdminSupabase();

  const { data: titulos, error: errT } = await admin
    .from("titulo")
    .select("id, cliente_id, valor, status")
    .eq("origem", "MENSALIDADE")
    .eq("competencia", competencia);
  if (errT) return { erro: `Falha ao ler os honorários: ${errT.message}` };

  const { data: notas, error: errN } = await admin
    .from("nfse")
    .select("cliente_id, numero, valor, status")
    .eq("competencia", competencia)
    .in("status", ["autorizada", "cancelada"]);
  if (errN) return { erro: `Falha ao ler as notas: ${errN.message}` };

  const idsTitulo = (titulos ?? []).map((t) => t.id as string);
  const { data: diretos } = idsTitulo.length
    ? await admin
        .from("boleto")
        .select("titulo_id, numero, linha_digitavel")
        .in("titulo_id", idsTitulo)
        .not("status", "in", "(cancelado,erro)")
    : { data: [] };
  const { data: vinculos } = idsTitulo.length
    ? await admin
        .from("boleto_titulo")
        .select("titulo_id, boleto:boleto_id(id, numero, linha_digitavel, status)")
        .in("titulo_id", idsTitulo)
    : { data: [] };

  const boletoPorTitulo = new Map<string, { numero: number; temLinhaDigitavel: boolean }>();
  for (const b of diretos ?? [])
    boletoPorTitulo.set(b.titulo_id as string, {
      numero: Number(b.numero),
      temLinhaDigitavel: Boolean(b.linha_digitavel),
    });
  for (const v of vinculos ?? []) {
    const b = (Array.isArray(v.boleto) ? v.boleto[0] : v.boleto) as {
      numero?: number;
      linha_digitavel?: string | null;
      status?: string;
    } | null;
    if (!b || b.status === "cancelado" || b.status === "erro") continue;
    boletoPorTitulo.set(v.titulo_id as string, {
      numero: Number(b.numero),
      temLinhaDigitavel: Boolean(b.linha_digitavel),
    });
  }

  const clienteIds = [
    ...new Set([
      ...(titulos ?? []).map((t) => t.cliente_id as string),
      ...(notas ?? []).map((n) => n.cliente_id as string).filter(Boolean),
    ]),
  ];
  const { data: clientes } = clienteIds.length
    ? await admin
        .from("clientes")
        .select(
          "id, razao_social, grupo_cobranca_id, telefone, telefone_ddi, email, email_2, telefone_2, telefone_ddi_2, email_envio, email_2_envio, whatsapp_envio, whatsapp_2_envio, grupo_cobranca!clientes_grupo_cobranca_id_fkey(nome), clientes_financeiro(cobranca_whatsapp, cobranca_email)",
        )
        .in("id", clienteIds)
    : { data: [] };

  const entradas: ClienteConferencia[] = (clientes ?? []).map((c) => {
    const fin = (Array.isArray(c.clientes_financeiro) ? c.clientes_financeiro[0] : c.clientes_financeiro) as
      | { cobranca_whatsapp?: boolean; cobranca_email?: boolean }
      | undefined;
    const grp = (Array.isArray(c.grupo_cobranca) ? c.grupo_cobranca[0] : c.grupo_cobranca) as {
      nome?: string | null;
    } | null;
    const t = (titulos ?? []).find((x) => x.cliente_id === c.id);
    const flags = { whatsapp: fin?.cobranca_whatsapp ?? true, email: fin?.cobranca_email ?? true };
    const temTelefone = telefonesDeEnvio(c).length > 0;
    const temEmail = emailsDeEnvio(c).length > 0;
    return {
      clienteId: c.id as string,
      razaoSocial: (c.razao_social as string) ?? "—",
      grupoNome: (grp?.nome as string | null) ?? null,
      titulo: t ? { valor: Number(t.valor), status: t.status as string } : null,
      notas: (notas ?? [])
        .filter((n) => n.cliente_id === c.id)
        .map((n) => ({
          numero: n.numero === null ? null : Number(n.numero),
          valor: Number(n.valor),
          cancelada: n.status === "cancelada",
        })),
      boleto: t ? (boletoPorTitulo.get(t.id as string) ?? null) : null,
      temContato: canaisParaEnvio(flags, { temTelefone, temEmail }).enviar.length > 0,
    };
  });

  return conferirHonorarios(entradas);
}

// Mesma conferência, no contrato de exportação. A tela e a planilha leem a mesma conta.
export async function relatorioConferencia(competencia: string): Promise<RelatorioExportavel | { erro: string }> {
  const r = await conferenciaDaCompetencia(competencia);
  if ("erro" in r) return r;
  return {
    titulo: "Conferência de honorários — financeiro x fiscal",
    subtitulo: `Competência ${competenciaBR(competencia)} · ${r.totais.clientes} clientes · ${r.totais.comDivergencia} com divergência`,
    colunas: [
      { chave: "cliente", rotulo: "Cliente", formato: "texto" },
      { chave: "grupo", rotulo: "Grupo", formato: "texto" },
      { chave: "valorTitulo", rotulo: "Boleto (financeiro)", formato: "moeda" },
      { chave: "valorNota", rotulo: "Nota (fiscal)", formato: "moeda" },
      { chave: "diferenca", rotulo: "Diferença", formato: "moeda" },
      { chave: "numeroNota", rotulo: "Nº da nota", formato: "texto" },
      { chave: "numeroBoleto", rotulo: "Nº do boleto", formato: "texto" },
      { chave: "situacao", rotulo: "Situação", formato: "texto" },
    ],
    linhas: r.linhas.map((l) => ({
      cliente: l.razaoSocial,
      grupo: l.grupoNome ?? "",
      valorTitulo: l.valorTitulo ?? 0,
      valorNota: l.valorNota ?? 0,
      diferenca: Number(((l.valorNota ?? 0) - (l.valorTitulo ?? 0)).toFixed(2)),
      numeroNota: l.numeroNota === null ? "—" : String(l.numeroNota),
      numeroBoleto: l.numeroBoleto === null ? "—" : String(l.numeroBoleto),
      situacao: l.situacoes.length ? l.situacoes.join(" · ") : "OK",
    })),
    totais: {
      cliente: "TOTAL",
      valorTitulo: r.totais.financeiro,
      valorNota: r.totais.fiscal,
      diferenca: r.totais.diferenca,
    },
  };
}
