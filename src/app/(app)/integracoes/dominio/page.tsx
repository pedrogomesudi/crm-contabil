import { redirect } from "next/navigation";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { UploadDominio } from "@/components/dominio/UploadDominio";

export default async function IntegracaoDominioPage() {
  const perfil = await getPerfilAtual();
  // Importação grava em `clientes` (RLS: admin/assistente). Financeiro não
  // escreve cadastro, então não conduz a importação — fica fora do gate.
  if (!perfil || !["admin", "assistente"].includes(perfil.papel)) redirect("/");
  return (
    <main className="mx-auto max-w-3xl space-y-6 p-6">
      <header>
        <h1 className="text-xl font-semibold">Integração Domínio</h1>
        <p className="text-sm text-gray-600">
          Importe cadastro, regime e honorários a partir dos relatórios exportados do Domínio.
        </p>
      </header>
      <UploadDominio />
    </main>
  );
}
