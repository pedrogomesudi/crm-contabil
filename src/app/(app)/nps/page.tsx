import { Container } from "@/components/ui/Container";
import { redirect } from "next/navigation";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { podeCriarCliente } from "@/lib/clientes/permissoes";
import { PageHeader } from "@/components/ui/PageHeader";
import { formatarData } from "@/lib/format";
import { controleCls } from "@/components/ui/Campo";
import { relatorioNps } from "./actions";

export const metadata = { title: "NPS" };

export default async function NpsPage({ searchParams }: { searchParams: Promise<{ de?: string; ate?: string }> }) {
  const perfil = await getPerfilAtual();
  if (!perfil || !podeCriarCliente(perfil.papel)) redirect("/");

  const sp = await searchParams;
  const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const de = sp.de || `${hoje.slice(0, 7)}-01`;
  const ate = sp.ate || hoje;

  const rel = await relatorioNps(de, ate);
  if (!rel) redirect("/");
  const { resumo: r, comentarios } = rel;
  const pct = (n: number) => (r.total > 0 ? Math.round((n / r.total) * 100) : 0);

  return (
    <Container largura="larga" className="space-y-5 p-4">
      <PageHeader titulo="NPS" subtitulo="Satisfação dos clientes coletada no portal" />

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
      </form>

      {r.total === 0 ? (
        <p className="rounded-2xl border border-linha bg-white p-6 text-sm text-cinza">Nenhuma resposta no período.</p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-4">
            <div className="rounded-2xl border border-linha bg-white p-4">
              <p className="text-xs text-cinza">Score NPS</p>
              <p
                className={`font-display text-4xl font-bold tabular-nums ${r.score < 0 ? "text-negativo" : "text-texto"}`}
              >
                {r.score}
              </p>
            </div>
            <div className="rounded-2xl border border-linha bg-white p-4">
              <p className="text-xs text-cinza">Promotores (9–10)</p>
              <p className="font-display text-2xl font-bold tabular-nums text-verde">
                {r.promotores} · {pct(r.promotores)}%
              </p>
            </div>
            <div className="rounded-2xl border border-linha bg-white p-4">
              <p className="text-xs text-cinza">Neutros (7–8)</p>
              <p className="font-display text-2xl font-bold tabular-nums text-cinza">
                {r.neutros} · {pct(r.neutros)}%
              </p>
            </div>
            <div className="rounded-2xl border border-linha bg-white p-4">
              <p className="text-xs text-cinza">Detratores (0–6)</p>
              <p className="font-display text-2xl font-bold tabular-nums text-negativo">
                {r.detratores} · {pct(r.detratores)}%
              </p>
            </div>
          </div>

          <div className="flex h-3 overflow-hidden rounded-full border border-linha">
            <div style={{ width: `${pct(r.promotores)}%` }} className="bg-verde" />
            <div style={{ width: `${pct(r.neutros)}%` }} className="bg-cinza-claro" />
            <div style={{ width: `${pct(r.detratores)}%` }} className="bg-negativo" />
          </div>
          <p className="text-xs text-cinza">{r.total} resposta(s) no período. Score varia de −100 a +100.</p>

          {comentarios.length > 0 && (
            <div className="overflow-x-auto rounded-2xl border border-linha bg-white">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-linha text-xs text-cinza">
                    <th className="px-3 py-2 text-left font-medium">Cliente</th>
                    <th className="px-3 py-2 text-right font-medium">Nota</th>
                    <th className="px-3 py-2 text-left font-medium">Comentário</th>
                    <th className="px-3 py-2 text-right font-medium">Data</th>
                  </tr>
                </thead>
                <tbody>
                  {comentarios.map((c, i) => (
                    <tr key={i} className="border-b border-linha/60">
                      <td className="px-3 py-2 text-texto">{c.cliente}</td>
                      <td
                        className={`px-3 py-2 text-right tabular-nums ${
                          c.nota >= 9 ? "text-verde" : c.nota <= 6 ? "text-negativo" : "text-cinza"
                        }`}
                      >
                        {c.nota}
                      </td>
                      <td className="px-3 py-2 text-texto">{c.comentario}</td>
                      <td className="px-3 py-2 text-right text-cinza">{formatarData(c.data)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </Container>
  );
}
