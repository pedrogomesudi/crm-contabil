import { Container } from "@/components/ui/Container";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { podeCriarCliente } from "@/lib/clientes/permissoes";
import { PageHeader } from "@/components/ui/PageHeader";
import { formatarData } from "@/lib/format";
import { listarAlertasReceita } from "./actions";
import { BotaoResolver } from "./BotaoResolver";

export const metadata = { title: "Alertas da Receita" };

export default async function AlertasReceitaPage() {
  const perfil = await getPerfilAtual();
  if (!perfil || !podeCriarCliente(perfil.papel)) redirect("/");
  const alertas = await listarAlertasReceita();

  return (
    <Container largura="larga" className="space-y-5 p-4">
      <PageHeader titulo="Alertas da Receita" subtitulo="Mudanças de situação cadastral e opção pelo Simples" />
      {alertas.length === 0 ? (
        <p className="rounded-2xl border border-linha bg-white p-6 text-sm text-cinza">Nenhum alerta em aberto.</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-linha bg-white">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-linha text-xs text-cinza">
                <th className="px-3 py-2 text-left font-medium">Cliente</th>
                <th className="px-3 py-2 text-left font-medium">Tipo</th>
                <th className="px-3 py-2 text-left font-medium">Mudança</th>
                <th className="px-3 py-2 text-right font-medium">Quando</th>
                <th className="px-3 py-2 text-right font-medium">Ação</th>
              </tr>
            </thead>
            <tbody>
              {alertas.map((a) => (
                <tr key={a.id} className="border-b border-linha/60">
                  <td className="px-3 py-2">
                    <Link href={`/clientes/${a.clienteId}`} className="text-verde underline">
                      {a.cliente}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-cinza">{a.tipo === "simples" ? "Simples" : "Situação"}</td>
                  <td className="px-3 py-2 text-texto">
                    {a.de ?? "—"} → <strong>{a.para ?? "—"}</strong>
                  </td>
                  <td className="px-3 py-2 text-right text-cinza">{formatarData(a.criadoEm)}</td>
                  <td className="px-3 py-2 text-right">
                    <BotaoResolver id={a.id} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Container>
  );
}
