import { Container } from "@/components/ui/Container";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { podeGerenciarTarefas, podeGerenciarTemplatesEmail } from "@/lib/clientes/permissoes";
import { PageHeader } from "@/components/ui/PageHeader";
import { detalheComunicado } from "../actions";
import { Reenviar } from "./Reenviar";

export default async function ComunicadoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const perfil = await getPerfilAtual();
  if (!perfil || !podeGerenciarTarefas(perfil.papel)) redirect("/");

  const { comunicado, destinatarios } = await detalheComunicado(id);
  if (!comunicado) notFound();

  return (
    <Container largura="estreita" className="space-y-5 p-4">
      <Link href="/comunicados" className="text-sm text-verde underline">
        ← Comunicados
      </Link>
      <PageHeader
        titulo={comunicado.titulo}
        subtitulo={`${comunicado.canal === "email" ? "E-mail" : "WhatsApp"} · ${comunicado.filtroTexto} · ${comunicado.enviados} enviado(s), ${comunicado.erros} erro(s)`}
      />

      {podeGerenciarTemplatesEmail(perfil.papel) && <Reenviar comunicadoId={id} erros={comunicado.erros} />}

      <div className="overflow-x-auto rounded-2xl border border-linha bg-white">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-linha text-xs text-cinza">
              <th className="px-3 py-2 text-left font-medium">Cliente</th>
              <th className="px-3 py-2 text-left font-medium">Destino</th>
              <th className="px-3 py-2 text-left font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {destinatarios.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-3 py-4 text-cinza">
                  Nenhum destinatário.
                </td>
              </tr>
            ) : (
              destinatarios.map((d) => (
                <tr key={d.id} className="border-b border-linha/60">
                  <td className="px-3 py-2 text-texto">
                    {d.clienteId ? (
                      <Link href={`/clientes/${d.clienteId}`} className="text-verde underline">
                        {d.nome}
                      </Link>
                    ) : (
                      d.nome
                    )}
                  </td>
                  <td className="px-3 py-2 text-cinza">{d.para}</td>
                  <td className={`px-3 py-2 text-xs ${d.status === "ENVIADO" ? "text-verde" : "text-negativo"}`}>
                    {d.status === "ENVIADO" ? "Enviado" : `Erro: ${d.erro ?? "falha"}`}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </Container>
  );
}
