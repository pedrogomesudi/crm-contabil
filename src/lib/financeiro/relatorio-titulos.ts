import type { ColunaRelatorio, RelatorioExportavel } from "@/lib/exportar/tipos";
import { FILTROS_STATUS, LABEL_STATUS, rotuloOrigem, type FiltroStatus, type SelecaoGrupo } from "./titulos";

// Uma linha da tabela de contas a receber: o título mais o que a tela deriva dele
// (saldo e o status exibido, em que VENCIDO não é persistido).
export type LinhaRelatorioTitulo = {
  t: {
    cliente: string;
    grupoNome: string | null;
    origem: string;
    competencia: string;
    vencimento: string;
    valor: number;
  };
  saldo: number;
  status: string;
};

export type ContextoRelatorioTitulos = {
  competencia: string;
  filtro: FiltroStatus;
  grupoSel: SelecaoGrupo;
  grupos: { id: string; nome: string }[];
  busca: string;
};

const COLUNAS: ColunaRelatorio[] = [
  { chave: "cliente", rotulo: "Cliente", formato: "texto" },
  { chave: "grupo", rotulo: "Grupo", formato: "texto" },
  { chave: "origem", rotulo: "Origem", formato: "texto" },
  // Competência em texto mm/aaaa: como data viraria "01/08/2026" e se confundiria com vencimento.
  { chave: "competencia", rotulo: "Competência", formato: "texto" },
  { chave: "vencimento", rotulo: "Vencimento", formato: "data" },
  { chave: "valor", rotulo: "Valor", formato: "moeda" },
  { chave: "saldo", rotulo: "Saldo", formato: "moeda" },
  { chave: "status", rotulo: "Status", formato: "texto" },
];

// "2026-08-01" -> "08/2026"
function mesAno(competencia: string): string {
  const [ano, mes] = competencia.split("-");
  return `${mes}/${ano}`;
}

// O arquivo precisa dizer de que recorte ele saiu. Sem isso, uma planilha filtrada chega ao
// destinatário parecendo o mês inteiro — e ninguém tem como perceber a diferença olhando.
function subtitulo(ctx: ContextoRelatorioTitulos): string {
  const partes = [`Competência ${mesAno(ctx.competencia)}`];
  if (ctx.filtro !== "TODOS") {
    partes.push(FILTROS_STATUS.find((f) => f.chave === ctx.filtro)?.rotulo ?? ctx.filtro);
  }
  if (ctx.grupoSel === "SEM_GRUPO") partes.push("Sem grupo");
  else if (ctx.grupoSel !== "TODOS") {
    partes.push(ctx.grupos.find((g) => g.id === ctx.grupoSel)?.nome ?? "Grupo");
  }
  const q = ctx.busca.trim();
  if (q) partes.push(`busca: "${q}"`);
  return partes.join(" · ");
}

// Monta o relatório a partir das linhas JÁ FILTRADAS — o arquivo espelha exatamente o que
// está na tela, que é o ponto do recurso. Valores vão crus (número em moeda, ISO em data):
// a camada de exportação formata, e no XLSX eles entram nativos para o Excel somar e ordenar.
export function montarRelatorioTitulos(
  linhas: LinhaRelatorioTitulo[],
  ctx: ContextoRelatorioTitulos,
): RelatorioExportavel {
  const rel: RelatorioExportavel = {
    titulo: "Contas a receber",
    subtitulo: subtitulo(ctx),
    colunas: COLUNAS,
    linhas: linhas.map(({ t, saldo, status }) => ({
      cliente: t.cliente,
      grupo: t.grupoNome ?? "",
      origem: rotuloOrigem(t.origem),
      competencia: mesAno(t.competencia),
      vencimento: t.vencimento,
      valor: t.valor,
      saldo,
      status: LABEL_STATUS[status] ?? status,
    })),
  };
  if (linhas.length > 0) {
    const soma = (f: (l: LinhaRelatorioTitulo) => number) => Number(linhas.reduce((s, l) => s + f(l), 0).toFixed(2));
    rel.totais = {
      cliente: `Total (${linhas.length} ${linhas.length === 1 ? "título" : "títulos"})`,
      valor: soma((l) => l.t.valor),
      saldo: soma((l) => l.saldo),
    };
  }
  return rel;
}
