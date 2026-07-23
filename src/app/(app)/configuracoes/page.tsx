import { Container } from "@/components/ui/Container";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { PageHeader } from "@/components/ui/PageHeader";
import { gruposDoPapel } from "@/lib/ui/configuracoes";

export const metadata = { title: "Configurações" };

export default async function ConfiguracoesHubPage() {
  const perfil = await getPerfilAtual();
  if (!perfil || !["admin", "assistente"].includes(perfil.papel)) redirect("/");
  const grupos = gruposDoPapel(perfil.papel);
  const total = grupos.reduce((n, g) => n + g.itens.length, 0);

  return (
    <Container largura="padrao" className="space-y-6 p-4">
      <PageHeader
        titulo="Configurações"
        subtitulo={`${total} telas de ajuste, agrupadas por tema — do cadastro do cliente aos canais de envio`}
      />

      {/* Índice: com oito seções, rolar até o fim para saber o que existe é o que se quer evitar.
          Âncoras puras — sem JS, e o scroll-mt das seções impede o título de encostar no topo. */}
      {grupos.length > 1 && (
        <nav aria-label="Ir para uma seção" className="flex flex-wrap gap-1.5 text-sm">
          {grupos.map((g) => (
            <a
              key={g.id}
              href={`#${g.id}`}
              className="rounded-lg border border-linha bg-white px-3 py-1.5 text-cinza transition hover:bg-creme hover:text-texto"
            >
              {g.titulo}
            </a>
          ))}
        </nav>
      )}

      <div className="space-y-8">
        {grupos.map((g) => (
          <section key={g.id} id={g.id} className="scroll-mt-4 space-y-3">
            <div className="border-b border-linha pb-2">
              <h2 className="font-display text-base font-semibold tracking-tight text-texto">
                {g.titulo}
                <span className="ml-2 align-middle text-xs font-normal text-cinza-claro">{g.itens.length}</span>
              </h2>
              <p className="mt-0.5 text-xs text-cinza">{g.resumo}</p>
            </div>
            {/* auto-rows-fr + h-full: todos os cards com a mesma altura, mesmo quando a descrição
                ocupa mais linhas em um deles. Sem isso o grid vira uma escada. */}
            <ul className="grid auto-rows-fr gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {g.itens.map((i) => (
                <li key={i.href}>
                  <Link
                    href={i.href}
                    className="flex h-full items-start justify-between gap-3 rounded-2xl border border-linha bg-white p-4 transition hover:border-cinza-claro hover:shadow-sm"
                  >
                    <span>
                      <span className="block font-medium text-texto">{i.label}</span>
                      <span className="mt-0.5 block text-xs text-cinza">{i.desc}</span>
                    </span>
                    <svg
                      className="mt-1 shrink-0 text-cinza-claro"
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      aria-hidden="true"
                    >
                      <path d="m9 6 6 6-6 6" />
                    </svg>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </Container>
  );
}
