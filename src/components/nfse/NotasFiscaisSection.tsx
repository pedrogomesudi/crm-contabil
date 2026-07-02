import { createServerSupabase } from "@/lib/supabase/server";
import { podeVerHonorario } from "@/lib/clientes/permissoes";
import { formatarData } from "@/lib/format";
import type { Papel } from "@/lib/tipos";
import { EmitirNfse } from "./EmitirNfse";
import { BaixarNfse } from "./BaixarNfse";

const ROTULO_STATUS: Record<string, string> = {
  processando: "Processando",
  autorizada: "Autorizada",
  rejeitada: "Rejeitada",
  erro: "Erro",
  cancelada: "Cancelada",
};

// Seção de NFS-e da ficha. Só aparece para quem vê honorário (dado financeiro).
export async function NotasFiscaisSection({ clienteId, papel }: { clienteId: string; papel: Papel }) {
  if (!podeVerHonorario(papel)) return null;
  const supabase = await createServerSupabase();

  const [{ data: fin }, { data: cfg }, { data: notas }] = await Promise.all([
    supabase.from("clientes_financeiro").select("honorario_mensal").eq("cliente_id", clienteId).maybeSingle(),
    supabase.from("nfse_config").select("ambiente").eq("id", 1).maybeSingle(),
    supabase
      .from("nfse")
      .select("id, competencia, status, numero, valor, chave_acesso, mensagens, ambiente")
      .eq("cliente_id", clienteId)
      .order("competencia", { ascending: false })
      .order("criado_em", { ascending: false })
      .limit(50),
  ]);

  const honorario = Number(fin?.honorario_mensal ?? 0);
  const ambiente = cfg?.ambiente ?? "homologacao";

  return (
    <section className="max-w-2xl space-y-3 rounded-lg border border-slate-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-slate-900">Notas fiscais (NFS-e)</h2>

      {honorario > 0 ? (
        <EmitirNfse clienteId={clienteId} honorario={honorario} ambiente={ambiente} />
      ) : (
        <p className="text-sm text-slate-500">Defina o honorário do cliente para emitir NFS-e.</p>
      )}

      {notas && notas.length > 0 ? (
        <div className="overflow-hidden rounded border border-slate-200">
          <table className="w-full text-sm">
            <caption className="sr-only">Notas fiscais do cliente</caption>
            <thead className="bg-slate-100 text-left text-slate-700">
              <tr>
                <th className="p-2 font-medium">Competência</th>
                <th className="p-2 font-medium">Número</th>
                <th className="p-2 font-medium">Valor</th>
                <th className="p-2 font-medium">Status</th>
                <th className="p-2 font-medium">Documentos</th>
              </tr>
            </thead>
            <tbody>
              {notas.map((n) => (
                <tr key={n.id} className="border-t border-slate-100 align-top">
                  <td className="p-2 text-slate-900">{formatarData(n.competencia)}</td>
                  <td className="p-2 text-slate-700">{n.numero ?? "—"}</td>
                  <td className="p-2 text-slate-700">R$ {Number(n.valor).toFixed(2)}</td>
                  <td className="p-2 text-slate-700">
                    {ROTULO_STATUS[n.status] ?? n.status}
                    {n.ambiente === "homologacao" && (
                      <span className="ml-1 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800">
                        homologação
                      </span>
                    )}
                    {n.status === "rejeitada" && Array.isArray(n.mensagens) && (
                      <span className="block text-xs text-red-600">
                        {(n.mensagens as { descricao?: string }[]).map((m) => m.descricao).join("; ")}
                      </span>
                    )}
                  </td>
                  <td className="p-2">
                    {n.status === "autorizada" && n.chave_acesso && (
                      <BaixarNfse nfseId={n.id} numero={n.numero ?? ""} chave={n.chave_acesso} />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-slate-500">Nenhuma NFS-e emitida.</p>
      )}
    </section>
  );
}
