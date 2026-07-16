import { createServerSupabase } from "@/lib/supabase/server";
import { ultimosAcessos } from "@/lib/portal/rastreio";
import { formatarData } from "@/lib/format";
import { podeGerenciarDocumentos } from "@/lib/clientes/permissoes";
import type { Papel } from "@/lib/tipos";
import { UploadDocumento } from "./UploadDocumento";
import { BotaoBaixar } from "./BotaoBaixar";
import { BotaoExcluirDocumento } from "./BotaoExcluirDocumento";
import { EnviarAssinatura } from "@/components/assinatura/EnviarAssinatura";
import { StatusAssinatura } from "@/components/assinatura/StatusAssinatura";

// Seção de documentos da ficha do cliente. A lista usa o client com RLS (o
// usuário só vê documentos de clientes visíveis a ele). Anexar exige papel de
// gestão; excluir é exclusivo do admin.
export async function DocumentosSection({
  clienteId,
  papel,
  clienteNome,
  clienteEmail,
}: {
  clienteId: string;
  papel: Papel;
  clienteNome: string;
  clienteEmail: string;
}) {
  const supabase = await createServerSupabase();
  const vistos = await ultimosAcessos(clienteId, "documento"); // RF-053: o cliente já viu?
  const { data: documentos, error } = await supabase
    .from("documentos")
    .select("id, nome, tipo, enviado_em, origem")
    .eq("cliente_id", clienteId)
    .order("enviado_em", { ascending: false })
    .order("id")
    .limit(100);

  const { data: assinaturas } = await supabase
    .from("assinaturas")
    .select("documento_id, status, assinatura_signatarios(nome, papel, status)")
    .eq("cliente_id", clienteId)
    .order("criado_em", { ascending: true });
  // ascendente => ao colidir por documento_id, a assinatura mais recente sobrescreve no Map.
  const porDoc = new Map((assinaturas ?? []).map((a) => [a.documento_id, a]));

  const podeGerenciar = podeGerenciarDocumentos(papel);
  const ehAdmin = papel === "admin";

  return (
    <section className="max-w-2xl space-y-3 rounded-lg border border-linha bg-white p-4">
      <h2 className="text-sm font-semibold text-texto">Documentos</h2>

      {podeGerenciar && <UploadDocumento clienteId={clienteId} />}

      {error ? (
        <p role="alert" className="rounded bg-negativo/10 px-3 py-2 text-sm text-negativo">
          Não foi possível carregar os documentos.
        </p>
      ) : documentos && documentos.length > 0 ? (
        <div className="overflow-hidden rounded border border-linha">
          <table className="w-full text-sm">
            <caption className="sr-only">Documentos do cliente</caption>
            <thead className="bg-creme text-left text-cinza">
              <tr>
                <th className="p-2 font-medium">Nome</th>
                <th className="p-2 font-medium">Tipo</th>
                <th className="p-2 font-medium">Enviado em</th>
                <th className="p-2 font-medium">Ações</th>
              </tr>
            </thead>
            <tbody>
              {documentos.map((d) => (
                <tr key={d.id} className="border-t border-linha/70 align-top">
                  <td className="p-2 text-texto">
                    {d.nome}
                    {d.origem === "cliente" && (
                      <span className="ml-2 rounded-full bg-violeta/10 px-2 py-0.5 text-xs text-violeta">
                        enviado pelo cliente
                      </span>
                    )}
                    <span className="ml-2 text-xs text-cinza">
                      {vistos.has(d.id)
                        ? `· visto em ${formatarData(vistos.get(d.id) as string)}`
                        : "· não visualizado"}
                    </span>
                  </td>
                  <td className="p-2 text-cinza">{d.tipo ?? "—"}</td>
                  <td className="p-2 text-cinza">
                    <time dateTime={d.enviado_em}>{formatarData(d.enviado_em)}</time>
                  </td>
                  <td className="p-2">
                    <div className="flex flex-wrap gap-2">
                      <BotaoBaixar documentoId={d.id} nome={d.nome} />
                      {ehAdmin && <BotaoExcluirDocumento documentoId={d.id} clienteId={clienteId} nome={d.nome} />}
                    </div>
                    {d.tipo === "Contrato" && d.nome.toLowerCase().endsWith(".pdf") && podeGerenciar && (
                      <div className="mt-2 space-y-2">
                        {porDoc.get(d.id) && (
                          <StatusAssinatura
                            status={porDoc.get(d.id)!.status}
                            signatarios={porDoc.get(d.id)!.assinatura_signatarios}
                          />
                        )}
                        {(() => {
                          const st = porDoc.get(d.id)?.status;
                          // Sem assinatura ativa (nova, recusada ou cancelada) => permite (re)enviar.
                          return !st || st === "recusado" || st === "cancelado";
                        })() && (
                          <EnviarAssinatura
                            documentoId={d.id}
                            clienteId={clienteId}
                            clienteNome={clienteNome}
                            clienteEmail={clienteEmail}
                          />
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-cinza-claro">Nenhum documento anexado.</p>
      )}
    </section>
  );
}
