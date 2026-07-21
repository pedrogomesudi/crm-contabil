import { Container } from "@/components/ui/Container";
import { redirect } from "next/navigation";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { PageHeader } from "@/components/ui/PageHeader";
import { Voltar } from "@/components/ui/Voltar";
import { BotaoExportar } from "@/components/ui/BotaoExportar";
import type { RelatorioExportavel } from "@/lib/exportar/tipos";
import { formatarData } from "@/lib/format";
import { formatarHoras } from "@/lib/timesheet/apontamento";
import { relatorioProdutividade } from "./actions";
import { controleCls } from "@/components/ui/Campo";

export const metadata = { title: "Produtividade por colaborador" };

export default async function ProdutividadePage({
  searchParams,
}: {
  searchParams: Promise<{ de?: string; ate?: string }>;
}) {
  const perfil = await getPerfilAtual();
  if (!perfil || perfil.papel !== "admin") redirect("/");

  const sp = await searchParams;
  const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const de = sp.de || `${hoje.slice(0, 7)}-01`;
  const ate = sp.ate || hoje;

  const linhas = await relatorioProdutividade(de, ate);
  if (!linhas) redirect("/");

  const totMin = linhas.reduce((s, l) => s + l.minutos, 0);
  const totTarefas = linhas.reduce((s, l) => s + l.tarefas, 0);
  const totObrig = linhas.reduce((s, l) => s + l.obrigacoes, 0);

  // Carteira NÃO soma no rodapé: o mesmo cliente pode ser atendido por duas pessoas, e
  // somar contaria em duplicidade. Fica "—", como % na rentabilidade.
  const relatorio: RelatorioExportavel = {
    titulo: "Produtividade por colaborador",
    subtitulo: `${formatarData(de)} a ${formatarData(ate)}`,
    colunas: [
      { chave: "nome", rotulo: "Colaborador", formato: "texto" },
      { chave: "horas", rotulo: "Horas", formato: "texto" },
      { chave: "tarefas", rotulo: "Tarefas concluídas", formato: "numero" },
      { chave: "obrigacoes", rotulo: "Obrigações entregues", formato: "numero" },
      { chave: "carteira", rotulo: "Carteira", formato: "numero" },
    ],
    linhas: linhas.map((l) => ({
      nome: l.nome,
      horas: formatarHoras(l.minutos),
      tarefas: l.tarefas,
      obrigacoes: l.obrigacoes,
      carteira: l.carteira,
    })),
    totais: {
      nome: "Total",
      horas: formatarHoras(totMin),
      tarefas: totTarefas,
      obrigacoes: totObrig,
      carteira: "—",
    },
  };

  return (
    <Container largura="larga" className="space-y-5 p-4">
      <Voltar href="/financeiro/cadastros" />
      <PageHeader
        titulo="Produtividade por colaborador"
        subtitulo="Horas, tarefas concluídas, obrigações entregues e carteira atendida por pessoa"
      />

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

      <div className="overflow-x-auto rounded-2xl border border-linha bg-white">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-linha text-xs text-cinza">
              <th className="px-3 py-2 text-left font-medium">Colaborador</th>
              <th className="px-3 py-2 text-right font-medium">Horas</th>
              <th className="px-3 py-2 text-right font-medium">Tarefas</th>
              <th className="px-3 py-2 text-right font-medium">Obrigações</th>
              <th className="px-3 py-2 text-right font-medium">Carteira</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l.usuarioId} className="border-b border-linha/60 hover:bg-creme">
                <td className="px-3 py-2 text-texto">{l.nome}</td>
                <td className="px-3 py-2 text-right text-cinza">{formatarHoras(l.minutos)}</td>
                <td className="px-3 py-2 text-right text-texto">{l.tarefas}</td>
                <td className="px-3 py-2 text-right text-texto">{l.obrigacoes}</td>
                <td className="px-3 py-2 text-right text-cinza">{l.carteira}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-linha bg-creme text-sm font-medium">
              <td className="px-3 py-2 text-texto">Total</td>
              <td className="px-3 py-2 text-right text-texto">{formatarHoras(totMin)}</td>
              <td className="px-3 py-2 text-right text-texto">{totTarefas}</td>
              <td className="px-3 py-2 text-right text-texto">{totObrig}</td>
              <td className="px-3 py-2 text-right text-cinza">—</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <p className="text-xs text-cinza">
        <strong>Horas</strong> = tempo apontado no período. <strong>Tarefas</strong> = concluídas no período (por
        responsável). <strong>Obrigações</strong> = baixadas no período (por quem entregou). <strong>Carteira</strong> ={" "}
        clientes distintos com hora apontada. Toda a equipe ativa aparece — zero significa nada apontado/concluído no
        período. Ordenado por horas.
      </p>
    </Container>
  );
}
