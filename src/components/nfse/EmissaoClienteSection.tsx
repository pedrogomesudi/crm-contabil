import { createServerSupabase } from "@/lib/supabase/server";
import { podeVerHonorario, podeConfigurarNfse } from "@/lib/clientes/permissoes";
import { certificadoValido } from "@/lib/nfse/emitente";
import { formatarData } from "@/lib/format";
import type { Papel } from "@/lib/tipos";
import { EmitenteConfig } from "./EmitenteConfig";
import { EmitirNfseCliente } from "./EmitirNfseCliente";
import { BaixarNfse } from "./BaixarNfse";
import { CancelarNfse } from "./CancelarNfse";

const ROTULO: Record<string, string> = {
  processando: "Processando",
  autorizada: "Autorizada",
  rejeitada: "Rejeitada",
  erro: "Erro",
  cancelada: "Cancelada",
};

// Seção "Emissão de NFS-e" (cliente como emitente/prestador). Só para quem opera o financeiro.
export async function EmissaoClienteSection({ clienteId, papel }: { clienteId: string; papel: Papel }) {
  if (!podeVerHonorario(papel)) return null;
  const supabase = await createServerSupabase();

  const [{ data: emitente }, { data: cert }, { data: notas }] = await Promise.all([
    supabase.from("nfse_emitente").select("*").eq("cliente_id", clienteId).maybeSingle(),
    supabase.from("nfse_certificado_cliente").select("validade").eq("cliente_id", clienteId).maybeSingle(),
    supabase
      .from("nfse")
      .select("id, competencia, status, numero, valor, chave_acesso, mensagens, ambiente, tomador_razao_social")
      .eq("cliente_id", clienteId)
      .eq("emitente", "cliente")
      .order("competencia", { ascending: false })
      .order("criado_em", { ascending: false })
      .limit(50),
  ]);

  const validade = cert?.validade ?? null;
  const certValido = certificadoValido(validade);
  const configCompleta = Boolean(emitente?.codigo_municipio && emitente?.codigo_servico_nacional);
  const ambiente = emitente?.ambiente ?? "homologacao";
  const podeEmitir = configCompleta && certValido;

  return (
    <section className="max-w-4xl space-y-3 rounded-lg border border-linha bg-white p-4">
      <h2 className="text-sm font-semibold text-texto">Emissão de NFS-e (cliente como emitente)</h2>

      {podeConfigurarNfse(papel) && (
        <details className="rounded border border-linha p-2">
          <summary className="cursor-pointer text-sm text-cinza">Configuração do emitente</summary>
          <div className="mt-2">
            {/* key por atualizado_em: após salvar, remonta o form para os campos
                (incl. o <select> não-controlado) refletirem o valor persistido. */}
            <EmitenteConfig
              key={emitente?.atualizado_em ?? "novo"}
              clienteId={clienteId}
              emitente={emitente}
              certificadoValidade={validade}
            />
          </div>
        </details>
      )}

      {podeEmitir ? (
        <EmitirNfseCliente clienteId={clienteId} ambiente={ambiente} />
      ) : (
        <p className="text-sm text-cinza-claro">
          {podeConfigurarNfse(papel)
            ? "Configure os dados fiscais e envie um certificado A1 válido para emitir."
            : "Emissão indisponível: emitente sem configuração fiscal ou certificado válido."}
        </p>
      )}

      {notas && notas.length > 0 ? (
        <div className="overflow-x-auto rounded border border-linha">
          <table className="w-full text-sm">
            <caption className="sr-only">NFS-e emitidas pelo cliente</caption>
            <thead className="bg-creme text-left text-cinza">
              <tr>
                <th className="p-2 font-medium">Competência</th>
                <th className="p-2 font-medium">Tomador</th>
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
                  <td className="p-2 text-cinza">{n.tomador_razao_social ?? "—"}</td>
                  <td className="p-2 text-cinza">{n.numero ?? "—"}</td>
                  <td className="p-2 text-cinza">R$ {Number(n.valor).toFixed(2)}</td>
                  <td className="p-2 text-cinza">
                    {ROTULO[n.status] ?? n.status}
                    {n.ambiente === "homologacao" && (
                      <span className="ml-1 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800">
                        homologação
                      </span>
                    )}
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
        <p className="text-sm text-cinza-claro">Nenhuma NFS-e emitida por este cliente.</p>
      )}
    </section>
  );
}
