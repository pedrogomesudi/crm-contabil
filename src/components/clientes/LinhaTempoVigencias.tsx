import { createServerSupabase } from "@/lib/supabase/server";
import { podeVerHonorario } from "@/lib/clientes/permissoes";
import { formatarMoeda } from "@/lib/format";
import type { Papel } from "@/lib/tipos";

// As vigências nascem das mudanças (trigger de banco) — não se digitam. Por isso: só leitura.
function mesAno(iso: string): string {
  const [ano, mes] = iso.slice(0, 7).split("-");
  return `${mes}/${ano}`;
}

export async function LinhaTempoVigencias({ clienteId, papel }: { clienteId: string; papel: Papel }) {
  if (!podeVerHonorario(papel)) return null;
  const supabase = await createServerSupabase();

  const [{ data: hon }, { data: reg }] = await Promise.all([
    supabase
      .from("honorario_vigencia")
      .select("vigente_de, valor, estimada")
      .eq("cliente_id", clienteId)
      .order("vigente_de", { ascending: false }),
    supabase
      .from("regime_vigencia")
      .select("vigente_de, regime, estimada")
      .eq("cliente_id", clienteId)
      .order("vigente_de", { ascending: false }),
  ]);

  if (!hon?.length && !reg?.length) return null;

  return (
    <section className="max-w-4xl space-y-3 rounded-lg border border-linha bg-white p-4">
      <h2 className="text-sm font-semibold text-texto">Histórico de honorário e regime</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <h3 className="mb-1 text-xs font-medium text-cinza">Honorário</h3>
          <ul className="space-y-1 text-sm">
            {hon?.map((v) => (
              <li key={v.vigente_de} className="flex items-center gap-2">
                <span className="tabular-nums text-cinza">{mesAno(v.vigente_de)}</span>
                <span className="text-texto">{formatarMoeda(Number(v.valor))}</span>
                {v.estimada && (
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-cinza">estimada</span>
                )}
              </li>
            ))}
            {!hon?.length && <li className="text-sm text-cinza">Sem histórico.</li>}
          </ul>
        </div>
        <div>
          <h3 className="mb-1 text-xs font-medium text-cinza">Regime tributário</h3>
          <ul className="space-y-1 text-sm">
            {reg?.map((v) => (
              <li key={v.vigente_de} className="flex items-center gap-2">
                <span className="tabular-nums text-cinza">{mesAno(v.vigente_de)}</span>
                <span className="text-texto">{v.regime}</span>
                {v.estimada && (
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-cinza">estimada</span>
                )}
              </li>
            ))}
            {!reg?.length && <li className="text-sm text-cinza">Sem histórico.</li>}
          </ul>
        </div>
      </div>
      <p className="text-xs text-cinza">
        As vigências são registradas automaticamente a cada mudança. As marcadas como{" "}
        <strong>estimada</strong> vêm da carga inicial — não há registro do valor da época.
      </p>
    </section>
  );
}
