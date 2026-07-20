import { Container } from "@/components/ui/Container";
import { redirect } from "next/navigation";
import { Voltar } from "@/components/ui/Voltar";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { podeGerenciarFinanceiro } from "@/lib/financeiro/permissoes";
import { podeReativar } from "@/lib/financeiro/suspensao";
import { PageHeader } from "@/components/ui/PageHeader";
import { LinhaCliente } from "./LinhaCliente";
import { listarSuspensao, suspenderCliente, reativarCliente } from "./actions";

export default async function InadimplenciaPage() {
  const perfil = await getPerfilAtual();
  if (!perfil || !podeGerenciarFinanceiro(perfil.papel)) redirect("/");
  const dados = await listarSuspensao();
  if (!dados) redirect("/");
  const admin = podeReativar(dados.papel);
  return (
    <Container largura="padrao" className="space-y-6 p-4">
      <Voltar href="/financeiro/cadastros" />
      <PageHeader titulo="Inadimplência e suspensão" subtitulo="Sugestões de suspensão, suspensos e reativação" />

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-grafite">Sugeridos para suspensão ({dados.sugeridos.length})</h2>
        {dados.sugeridos.length === 0 ? (
          <p className="text-sm text-cinza">Ninguém elegível com a regra atual.</p>
        ) : (
          <ul className="space-y-2">
            {dados.sugeridos.map((i) => (
              <LinhaCliente key={i.clienteId} item={i} acaoLabel="Suspender" onAcao={suspenderCliente} />
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-grafite">Suspensos ({dados.suspensos.length})</h2>
        {dados.suspensos.length === 0 ? (
          <p className="text-sm text-cinza">Nenhum cliente suspenso.</p>
        ) : (
          <ul className="space-y-2">
            {dados.suspensos.map((i) =>
              admin ? (
                <LinhaCliente key={i.clienteId} item={i} acaoLabel="Reativar" onAcao={reativarCliente} />
              ) : (
                <li
                  key={i.clienteId}
                  className="flex items-center justify-between rounded-lg border border-linha bg-white p-3 text-sm"
                >
                  <span className="font-medium text-texto">{i.cliente}</span>
                  <span className="text-cinza">suspenso · só admin reativa</span>
                </li>
              ),
            )}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-grafite">Suspensos sem pendência ({dados.reativaveis.length})</h2>
        {dados.reativaveis.length === 0 ? (
          <p className="text-sm text-cinza">Nenhum.</p>
        ) : (
          <ul className="space-y-2">
            {dados.reativaveis.map((i) =>
              admin ? (
                <LinhaCliente key={i.clienteId} item={i} acaoLabel="Reativar (quitado)" onAcao={reativarCliente} />
              ) : (
                <li
                  key={i.clienteId}
                  className="flex items-center justify-between rounded-lg border border-linha bg-white p-3 text-sm"
                >
                  <span className="font-medium text-texto">{i.cliente}</span>
                  <span className="text-cinza">quitado · só admin reativa</span>
                </li>
              ),
            )}
          </ul>
        )}
      </section>
    </Container>
  );
}
