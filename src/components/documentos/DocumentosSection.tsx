import { createServerSupabase } from "@/lib/supabase/server";
import { ultimosAcessos } from "@/lib/portal/rastreio";
import { podeGerenciarDocumentos } from "@/lib/clientes/permissoes";
import type { Papel } from "@/lib/tipos";
import { UploadDocumento } from "./UploadDocumento";
import { DocumentosTabela } from "./DocumentosTabela";
import { carregarTiposAtivos } from "@/app/(app)/configuracoes/tipos-documento/actions";

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
  const tipos = await carregarTiposAtivos(); // RF-060: catálogo p/ classificar no upload
  const vistos = await ultimosAcessos(clienteId, "documento"); // RF-053: o cliente já viu?
  const { data: documentos, error } = await supabase
    .from("documentos")
    .select("id, nome, tipo, tipo_id, departamento, competencia, enviado_em, origem")
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

  // Achata cada documento (incl. assinatura) num item serializável para a tabela client.
  const docs = (documentos ?? []).map((d) => {
    const a = porDoc.get(d.id);
    return {
      id: d.id as string,
      nome: d.nome as string,
      origem: d.origem as string,
      enviado_em: d.enviado_em as string,
      visto: vistos.has(d.id) ? (vistos.get(d.id) as string) : null,
      tipo: (d.tipo as string | null) ?? null,
      departamento: (d.departamento as string | null) ?? null,
      competencia: (d.competencia as string | null) ?? null,
      ehContrato: d.tipo === "Contrato" && (d.nome as string).toLowerCase().endsWith(".pdf"),
      assinatura: a
        ? {
            status: a.status as string,
            signatarios: (a.assinatura_signatarios ?? []) as { nome: string; papel: string; status: string }[],
          }
        : null,
    };
  });

  return (
    <section className="space-y-3 rounded-lg border border-linha bg-white p-4">
      <h2 className="text-sm font-semibold text-texto">Documentos</h2>

      {podeGerenciar && <UploadDocumento clienteId={clienteId} tipos={tipos} />}

      {error ? (
        <p role="alert" className="rounded bg-negativo/10 px-3 py-2 text-sm text-negativo">
          Não foi possível carregar os documentos.
        </p>
      ) : docs.length > 0 ? (
        <DocumentosTabela
          docs={docs}
          clienteId={clienteId}
          clienteNome={clienteNome}
          clienteEmail={clienteEmail}
          podeGerenciar={podeGerenciar}
          ehAdmin={ehAdmin}
        />
      ) : (
        <p className="text-sm text-cinza-claro">Nenhum documento anexado.</p>
      )}
    </section>
  );
}
