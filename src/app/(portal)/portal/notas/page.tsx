import { createServerSupabase } from "@/lib/supabase/server";
import { portalSuspenso } from "@/lib/portal/suspensao";
import { AvisoSuspensao } from "@/components/portal/AvisoSuspensao";
import { urlDanfse } from "../actions";
import { BotaoBaixar } from "../BotaoBaixar";

export const metadata = { title: "Notas fiscais" };

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const mesAno = (iso: string) => `${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

export default async function PortalNotasPage() {
  if (await portalSuspenso()) return <AvisoSuspensao variante="bloqueio" recurso="Notas fiscais" />;
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("nfse")
    .select("id, numero, competencia, valor, status, danfse_path")
    .order("competencia", { ascending: false });
  const notas = data ?? [];

  return (
    <div className="space-y-4">
      <h1 className="font-display text-xl font-bold text-texto">Notas fiscais</h1>
      {notas.length === 0 ? (
        <p className="text-sm text-cinza">Nenhuma nota fiscal emitida.</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-linha bg-white">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-linha text-xs text-cinza">
                <th className="px-3 py-2 text-left font-medium">Número</th>
                <th className="px-3 py-2 text-left font-medium">Competência</th>
                <th className="px-3 py-2 text-right font-medium">Valor</th>
                <th className="px-3 py-2 text-left font-medium">Situação</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {notas.map((n) => (
                <tr key={n.id as string} className="border-b border-linha/60">
                  <td className="px-3 py-2 tabular-nums text-texto">{(n.numero as string | null) ?? "—"}</td>
                  <td className="px-3 py-2 text-cinza">{mesAno(n.competencia as string)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{brl(Number(n.valor))}</td>
                  <td className="px-3 py-2 text-cinza">{n.status as string}</td>
                  <td className="px-3 py-2 text-right">
                    {n.danfse_path ? (
                      <BotaoBaixar id={n.id as string} acao={urlDanfse} rotulo="baixar DANFSe" />
                    ) : (
                      <span className="text-xs text-cinza">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
