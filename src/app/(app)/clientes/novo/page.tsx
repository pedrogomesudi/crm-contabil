import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { listarContadores } from "@/lib/clientes/contadores";
import { FormCliente } from "@/components/FormCliente";
import { criarCliente } from "../actions";

export const metadata = { title: "Novo cliente" };

export default async function NovoClientePage() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: eu } = await supabase
    .from("usuarios")
    .select("papel")
    .eq("id", user.id)
    .maybeSingle();
  const podeCriar = eu?.papel === "admin" || eu?.papel === "assistente" || eu?.papel === "contador";
  if (!podeCriar) redirect("/clientes"); // financeiro não cria

  // admin/assistente escolhem o contador; contador é forçado a si mesmo (trigger).
  const contadorEditavel = eu?.papel === "admin" || eu?.papel === "assistente";
  const contadores = contadorEditavel ? await listarContadores() : [];

  return (
    <div>
      <h1 className="mb-4 text-2xl font-semibold text-slate-900">Novo cliente</h1>
      <FormCliente
        action={criarCliente}
        contadores={contadores}
        modo="novo"
        contadorEditavel={contadorEditavel}
      />
    </div>
  );
}
