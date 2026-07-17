import { redirect } from "next/navigation";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { PageHeader } from "@/components/ui/PageHeader";
import { FormDadosPagamento } from "@/components/nfse/FormDadosPagamento";

export default async function ConfigPagamentoPage() {
  const perfil = await getPerfilAtual();
  if (!perfil || perfil.papel !== "admin") redirect("/");
  const admin = createAdminSupabase();
  const { data } = await admin.from("dados_bancarios").select("*").eq("id", 1).maybeSingle();
  return (
    <main className="mx-auto max-w-[720px] space-y-5 p-4">
      <PageHeader titulo="Dados de pagamento" subtitulo="PIX e dados bancários enviados ao cliente com a NFS-e" />
      <FormDadosPagamento inicial={data ?? null} />
    </main>
  );
}
