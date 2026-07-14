import { redirect } from "next/navigation";
import Link from "next/link";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { podeGerenciarTarefas, podeGerenciarTemplatesEmail } from "@/lib/clientes/permissoes";
import { PageHeader } from "@/components/ui/PageHeader";
import { listarComunicados } from "./actions";

export const metadata = { title: "Comunicados" };

const quando = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

export default async function ComunicadosPage() {
  const perfil = await getPerfilAtual();
  if (!perfil || !podeGerenciarTarefas(perfil.papel)) redirect("/");
  const comunicados = await listarComunicados();
  const podeCriar = podeGerenciarTemplatesEmail(perfil.papel);

  return (
    <main className="mx-auto max-w-4xl space-y-5 p-4">
      <PageHeader titulo="Comunicados" subtitulo="Avisos em massa para um segmento da base" />

      {podeCriar && (
        <Link href="/comunicados/novo" className="inline-block rounded-lg bg-verde px-3 py-2 text-sm text-white">
          Novo comunicado
        </Link>
      )}

      {comunicados.length === 0 ? (
        <p className="text-sm text-cinza">Nenhum comunicado enviado ainda.</p>
      ) : (
        <ul className="space-y-2">
          {comunicados.map((c) => (
            <li key={c.id}>
              <Link
                href={`/comunicados/${c.id}`}
                className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-linha bg-white p-3 text-sm hover:bg-creme"
              >
                <span>
                  <span className="font-medium text-texto">{c.titulo}</span>
                  <span className="block text-xs text-cinza">
                    {c.canal === "email" ? "E-mail" : "WhatsApp"} · {c.filtroTexto} · {quando(c.criadoEm)}
                  </span>
                </span>
                <span className="flex items-center gap-3 text-xs">
                  <span className="text-verde">{c.enviados} enviado(s)</span>
                  {c.erros > 0 && <span className="text-negativo">{c.erros} erro(s)</span>}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
