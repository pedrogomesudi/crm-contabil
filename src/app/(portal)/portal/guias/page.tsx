import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { urlComprovanteObrigacao } from "../actions";
import { BotaoBaixar } from "../BotaoBaixar";

export const metadata = { title: "Guias" };

const dataBR = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "—");
const mesAno = (iso: string) => `${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

export default async function PortalGuiasPage() {
  const supabase = await createServerSupabase();
  // RLS: só as instâncias do próprio cliente.
  const { data } = await supabase
    .from("obrigacao_instancia")
    .select("id, obrigacao_id, competencia, vencimento_legal, status, comprovante_path")
    .order("competencia", { ascending: false })
    .limit(200);
  const instancias = data ?? [];

  // O nome da obrigação vive na matriz, que o cliente NÃO lê. Resolvo os nomes com
  // service_role apenas para os ids que a RLS já provou serem dele.
  const ids = [...new Set(instancias.map((i) => i.obrigacao_id as string))];
  const nomes = new Map<string, string>();
  if (ids.length > 0) {
    const admin = createAdminSupabase();
    const { data: obrigs } = await admin.from("obrigacao").select("id, nome").in("id", ids);
    for (const o of obrigs ?? []) nomes.set(o.id as string, o.nome as string);
  }

  return (
    <div className="space-y-4">
      <h1 className="font-display text-xl font-bold text-texto">Guias e comprovantes</h1>
      {instancias.length === 0 ? (
        <p className="text-sm text-cinza">Nenhuma obrigação registrada.</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-linha bg-white">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-linha text-xs text-cinza">
                <th className="px-3 py-2 text-left font-medium">Obrigação</th>
                <th className="px-3 py-2 text-left font-medium">Competência</th>
                <th className="px-3 py-2 text-left font-medium">Vencimento</th>
                <th className="px-3 py-2 text-left font-medium">Situação</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {instancias.map((i) => (
                <tr key={i.id as string} className="border-b border-linha/60">
                  <td className="px-3 py-2 text-texto">{nomes.get(i.obrigacao_id as string) ?? "—"}</td>
                  <td className="px-3 py-2 text-cinza">{mesAno(i.competencia as string)}</td>
                  <td className="px-3 py-2 text-cinza">{dataBR(i.vencimento_legal as string)}</td>
                  <td className="px-3 py-2 text-cinza">{i.comprovante_path ? "Entregue" : (i.status as string)}</td>
                  <td className="px-3 py-2 text-right">
                    {i.comprovante_path ? (
                      <BotaoBaixar id={i.id as string} acao={urlComprovanteObrigacao} rotulo="baixar comprovante" />
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
