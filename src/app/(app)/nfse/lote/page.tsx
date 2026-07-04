import { redirect } from "next/navigation";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { podeVerHonorario } from "@/lib/clientes/permissoes";
import { LoteNfse } from "@/components/nfse/LoteNfse";
import { BaixarNotasZip } from "@/components/nfse/BaixarNotasZip";

export default async function LoteNfsePage() {
  const perfil = await getPerfilAtual();
  if (!perfil || !podeVerHonorario(perfil.papel)) redirect("/");
  return (
    <main className="mx-auto max-w-3xl space-y-4 p-4">
      <h1 className="text-lg font-semibold text-slate-900">Emitir NFS-e em lote</h1>
      <LoteNfse />
      <BaixarNotasZip />
    </main>
  );
}
