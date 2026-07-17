import { redirect } from "next/navigation";
import Link from "next/link";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { listarColaboradores } from "@/lib/clientes/colaboradores";
import { PageHeader } from "@/components/ui/PageHeader";
import { listarCustos } from "./actions";
import { FormCustos } from "./FormCustos";

export const metadata = { title: "Custo por colaborador" };

export default async function CustosPage() {
  const perfil = await getPerfilAtual();
  if (!perfil || perfil.papel !== "admin") redirect("/");
  const custos = await listarCustos();
  const colaboradores = await listarColaboradores();
  const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

  return (
    <main className="mx-auto max-w-[720px] space-y-5 p-4">
      <Link href="/configuracoes" className="text-sm text-verde underline">
        ← Configurações
      </Link>
      <PageHeader
        titulo="Custo por colaborador"
        subtitulo="Base do custo de atendimento — visível apenas para o admin"
      />
      <FormCustos custos={custos} colaboradores={colaboradores} hoje={hoje} />
    </main>
  );
}
