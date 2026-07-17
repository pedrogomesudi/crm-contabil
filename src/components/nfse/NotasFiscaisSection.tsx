import { createServerSupabase } from "@/lib/supabase/server";
import { podeVerHonorario } from "@/lib/clientes/permissoes";
import { formatarData } from "@/lib/format";
import type { Papel } from "@/lib/tipos";
import { EmitirNfse } from "./EmitirNfse";
import { BaixarNfse } from "./BaixarNfse";
import { CancelarNfse } from "./CancelarNfse";
import { Badge } from "@/components/ui/Badge";
import { badgeStatusNfse } from "@/lib/ui/apresentacao";

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
      .select("id, competencia, status, numero, valor, chave_acesso, mensagens, ambiente, avulsa")
      .eq("cliente_id", clienteId)
      .order("competencia", { ascending: false })
      .order("criado_em", { ascending: false })
      .limit(50),
  ]);

  const honorario = Number(fin?.honorario_mensal ?? 0);
  const ambiente = cfg?.ambiente ?? "homologacao";

  return (
    <section className="space-y-3 rounded-lg border border-linha bg-white p-4">
      <h2 className="text-sm font-semibold text-texto">Notas fiscais (NFS-e)</h2>

      {honorario > 0 ? (
        <EmitirNfse clienteId={clienteId} honorario={honorario} ambiente={ambiente} />
      ) : (
        <p className="text-sm text-cinza-claro">Defina o honorário do cliente para emitir NFS-e.</p>
      )}

      {notas && notas.length > 0 ? (
        <div className="overflow-x-auto rounded border border-linha">
          <table className="w-full text-sm">
            <caption className="sr-only">Notas fiscais do cliente</caption>
            <thead className="bg-creme text-left text-cinza">
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
                <tr key={n.id} className="border-t border-linha/70 align-top">
                  <td className="p-2 text-texto">{formatarData(n.competencia)}</td>
                  <td className="p-2 font-mono text-xs text-cinza">{n.numero ?? "—"}</td>
                  <td className="p-2 font-mono text-xs tabular-nums text-texto">R$ {Number(n.valor).toFixed(2)}</td>
                  <td className="p-2">
                    <Badge variante={badgeStatusNfse(n.status)}>{ROTULO_STATUS[n.status] ?? n.status}</Badge>
                    {n.ambiente === "homologacao" && (
                      <span className="ml-1 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800">
                        homologação
                      </span>
                    )}
                    {n.avulsa && <span className="ml-1 rounded bg-creme px-1.5 py-0.5 text-xs text-cinza">avulsa</span>}
                    {n.status === "rejeitada" && Array.isArray(n.mensagens) && (
                      <span className="block text-xs text-negativo">
                        {(n.mensagens as { descricao?: string }[]).map((m) => m.descricao).join("; ")}
                      </span>
                    )}
                  </td>
                  <td className="p-2">
                    {n.status === "autorizada" && n.chave_acesso && (
                      <div className="space-y-1">
                        <BaixarNfse nfseId={n.id} numero={n.numero ?? ""} chave={n.chave_acesso} />
                        <CancelarNfse nfseId={n.id} />
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-cinza-claro">Nenhuma NFS-e emitida.</p>
      )}
    </section>
  );
}
