import { createServerSupabase } from "@/lib/supabase/server";
import { agruparVersoes } from "@/lib/documentos/versoes";
import { portalSuspenso } from "@/lib/portal/suspensao";
import { AvisoSuspensao } from "@/components/portal/AvisoSuspensao";
import { urlDocumento } from "../actions";
import { BotaoBaixar } from "../BotaoBaixar";
import { EnviarDocumento } from "./EnviarDocumento";

export const metadata = { title: "Documentos" };

const dataBR = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "—");

export default async function PortalDocumentosPage() {
  if (await portalSuspenso()) return <AvisoSuspensao variante="bloqueio" recurso="Documentos" />;
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("documentos")
    .select("id, nome, tipo, enviado_em, origem, substitui_id")
    .order("enviado_em", { ascending: false });
  // RF-060 (Fatia B): o cliente vê só a versão atual (esconde as substituídas).
  const docs = agruparVersoes(data ?? []).map((g) => g.atual);

  return (
    <div className="space-y-4">
      <h1 className="font-display text-xl font-bold text-texto">Documentos</h1>
      <EnviarDocumento />
      {docs.length === 0 ? (
        <p className="text-sm text-cinza">Nenhum documento disponível.</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-linha bg-white">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-linha text-xs text-cinza">
                <th className="px-3 py-2 text-left font-medium">Documento</th>
                <th className="px-3 py-2 text-left font-medium">Tipo</th>
                <th className="px-3 py-2 text-left font-medium">Enviado em</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {docs.map((d) => (
                <tr key={d.id as string} className="border-b border-linha/60">
                  <td className="px-3 py-2 text-texto">
                    {d.nome as string}
                    {d.origem === "cliente" && (
                      <span className="ml-2 rounded-full bg-creme px-2 py-0.5 text-xs text-cinza">
                        enviado por você
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-cinza">{(d.tipo as string | null) ?? "—"}</td>
                  <td className="px-3 py-2 text-cinza">
                    {dataBR(((d.enviado_em as string | null) ?? "").slice(0, 10) || null)}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <BotaoBaixar id={d.id as string} acao={urlDocumento} />
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
