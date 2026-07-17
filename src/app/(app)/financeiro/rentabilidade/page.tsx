import { Container } from "@/components/ui/Container";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { podeGerenciarFinanceiro } from "@/lib/financeiro/permissoes";
import { PageHeader } from "@/components/ui/PageHeader";
import { BotaoExportar } from "@/components/ui/BotaoExportar";
import type { RelatorioExportavel } from "@/lib/exportar/tipos";
import { formatarData, formatarMoeda } from "@/lib/format";
import { formatarHoras } from "@/lib/timesheet/apontamento";
import { margem } from "@/lib/timesheet/rentabilidade";
import { relatorioRentabilidade } from "./actions";
import { controleCls } from "@/components/ui/Campo";

export const metadata = { title: "Rentabilidade por cliente" };

export default async function RentabilidadePage({
  searchParams,
}: {
  searchParams: Promise<{ de?: string; ate?: string }>;
}) {
  const perfil = await getPerfilAtual();
  if (!perfil || !podeGerenciarFinanceiro(perfil.papel)) redirect("/");

  const sp = await searchParams;
  const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const de = sp.de || `${hoje.slice(0, 7)}-01`;
  const ate = sp.ate || hoje;

  const rel = await relatorioRentabilidade(de, ate);
  if (!rel) redirect("/");

  const semApontamento = rel.linhas.filter((l) => l.semApontamento).length;
  const totalMargem = rel.totais.recebido - rel.totais.custo;

  // Margem, % e R$/hora são derivados (não estão em LinhaRentab); "Horas" vai como
  // texto ("12h30"), igual à tela — hora decimal na planilha seria outro relatório.
  const relatorio: RelatorioExportavel = {
    titulo: "Rentabilidade por cliente",
    subtitulo: `${formatarData(de)} a ${formatarData(ate)}`,
    colunas: [
      { chave: "cliente", rotulo: "Cliente", formato: "texto" },
      { chave: "horas", rotulo: "Horas", formato: "texto" },
      { chave: "custo", rotulo: "Custo", formato: "moeda" },
      { chave: "recebido", rotulo: "Recebido", formato: "moeda" },
      { chave: "contratado", rotulo: "Contratado", formato: "moeda" },
      { chave: "margem", rotulo: "Margem", formato: "moeda" },
      { chave: "pct", rotulo: "%", formato: "percent" },
      { chave: "porHora", rotulo: "R$/hora", formato: "moeda" },
    ],
    linhas: rel.linhas.map((l) => {
      const m = margem(l);
      return {
        cliente: l.clienteNome,
        horas: formatarHoras(l.minutos),
        custo: l.custo,
        recebido: l.recebido,
        contratado: l.contratado,
        margem: m.valor,
        pct: m.pct,
        porHora: m.porHora,
      };
    }),
    // Como no rodapé da tela: % e R$/hora ficam vazios — média de razão não é razão de médias.
    totais: {
      cliente: "Total",
      horas: formatarHoras(rel.totais.minutos),
      custo: rel.totais.custo,
      recebido: rel.totais.recebido,
      contratado: rel.totais.contratado,
      margem: totalMargem,
      pct: null,
      porHora: null,
    },
  };

  return (
    <Container largura="larga" className="space-y-5 p-4">
      <PageHeader titulo="Rentabilidade por cliente" subtitulo="Quanto custou atender × quanto o cliente pagou" />

      <form
        method="GET"
        className="flex flex-wrap items-end gap-2 rounded-2xl border border-linha bg-white p-3 text-sm"
      >
        <label className="text-xs text-cinza">
          De
          <input type="date" name="de" defaultValue={de} className={`${controleCls("compacto")} mt-0.5 block`} />
        </label>
        <label className="text-xs text-cinza">
          Até
          <input type="date" name="ate" defaultValue={ate} className={`${controleCls("compacto")} mt-0.5 block`} />
        </label>
        <button className="rounded-lg bg-verde px-3 py-1.5 text-white">Aplicar</button>
        <div className="ml-auto print:hidden">
          <BotaoExportar relatorio={relatorio} />
        </div>
      </form>

      {rel.semCustoCadastrado && (
        <p className="rounded-lg bg-atencao-fundo px-3 py-2 text-sm text-atencao">
          Há apontamentos de colaboradores <strong>sem custo/hora cadastrado</strong> no período — o custo deles entrou
          como zero. Cadastre em{" "}
          <Link href="/configuracoes/custos" className="underline">
            Configurações → Custo por colaborador
          </Link>
          .
        </p>
      )}
      {semApontamento > 0 && (
        <p className="rounded-lg bg-atencao-fundo px-3 py-2 text-sm text-atencao">
          <strong>{semApontamento}</strong> cliente(s) sem nenhuma hora apontada no período. Custo zero aqui não
          significa cliente barato — significa que <strong>ninguém apontou</strong>.
        </p>
      )}

      <div className="overflow-x-auto rounded-2xl border border-linha bg-white">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-linha text-xs text-cinza">
              <th className="px-3 py-2 text-left font-medium">Cliente</th>
              <th className="px-3 py-2 text-right font-medium">Horas</th>
              <th className="px-3 py-2 text-right font-medium">Custo</th>
              <th className="px-3 py-2 text-right font-medium">Recebido</th>
              <th className="px-3 py-2 text-right font-medium">Contratado</th>
              <th className="px-3 py-2 text-right font-medium">Margem</th>
              <th className="px-3 py-2 text-right font-medium">%</th>
              <th className="px-3 py-2 text-right font-medium">R$/hora</th>
            </tr>
          </thead>
          <tbody>
            {rel.linhas.map((l) => {
              const m = margem(l);
              const atrasado = l.contratado > 0 && l.recebido < l.contratado;
              return (
                <tr key={l.clienteId} className="border-b border-linha/60 hover:bg-creme">
                  <td className="px-3 py-2">
                    <Link href={`/clientes/${l.clienteId}`} className="text-verde underline">
                      {l.clienteNome}
                    </Link>
                    {l.semApontamento && <span className="ml-1 text-xs text-cinza">(sem apontamento)</span>}
                    {l.semCusto && <span className="ml-1 text-xs text-atencao">(sem custo)</span>}
                  </td>
                  <td className="px-3 py-2 text-right text-cinza">{formatarHoras(l.minutos)}</td>
                  <td className="px-3 py-2 text-right text-cinza">{formatarMoeda(l.custo)}</td>
                  <td className="px-3 py-2 text-right text-texto">{formatarMoeda(l.recebido)}</td>
                  <td className={`px-3 py-2 text-right ${atrasado ? "text-atencao" : "text-cinza"}`}>
                    {formatarMoeda(l.contratado)}
                  </td>
                  <td className={`px-3 py-2 text-right font-medium ${m.valor < 0 ? "text-negativo" : "text-texto"}`}>
                    {formatarMoeda(m.valor)}
                  </td>
                  <td
                    className={`px-3 py-2 text-right ${m.pct !== null && m.pct < 0 ? "text-negativo" : "text-cinza"}`}
                  >
                    {m.pct === null ? "—" : `${m.pct}%`}
                  </td>
                  <td className="px-3 py-2 text-right text-cinza">
                    {m.porHora === null ? "—" : formatarMoeda(m.porHora)}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t border-linha bg-creme text-sm font-medium">
              <td className="px-3 py-2 text-texto">Total</td>
              <td className="px-3 py-2 text-right text-texto">{formatarHoras(rel.totais.minutos)}</td>
              <td className="px-3 py-2 text-right text-texto">{formatarMoeda(rel.totais.custo)}</td>
              <td className="px-3 py-2 text-right text-texto">{formatarMoeda(rel.totais.recebido)}</td>
              <td className="px-3 py-2 text-right text-texto">{formatarMoeda(rel.totais.contratado)}</td>
              <td className={`px-3 py-2 text-right ${totalMargem < 0 ? "text-negativo" : "text-texto"}`}>
                {formatarMoeda(totalMargem)}
              </td>
              <td colSpan={2} />
            </tr>
          </tfoot>
        </table>
      </div>

      <p className="text-xs text-cinza">
        <strong>Recebido</strong> = baixas não estornadas no período. <strong>Contratado</strong> = honorário mensal ×
        meses do período — em âmbar quando o recebido ficou abaixo dele (sinal de atraso). O custo usa o valor/hora{" "}
        <strong>vigente na data de cada apontamento</strong>. Ordenado por margem: os piores primeiro.
      </p>
    </Container>
  );
}
