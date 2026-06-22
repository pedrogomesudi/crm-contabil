import { createAdminSupabase } from "@/lib/supabase/admin";
import { FormCliente } from "@/components/FormCliente";
import { criarCliente } from "../actions";

export const metadata = { title: "Novo cliente" };

// Lista de contadores p/ o select. A RLS de `usuarios` só deixa ler a própria
// linha, então usamos o service_role (server-side) expondo só id/nome.
async function listarContadores() {
  const admin = createAdminSupabase();
  const { data } = await admin
    .from("usuarios")
    .select("id, nome")
    .eq("papel", "contador")
    .eq("ativo", true)
    .order("nome");
  return data ?? [];
}

export default async function NovoClientePage() {
  const contadores = await listarContadores();
  return (
    <div>
      <h1 className="mb-4 text-2xl font-semibold text-slate-900">Novo cliente</h1>
      <FormCliente action={criarCliente} contadores={contadores} modo="novo" />
    </div>
  );
}
