import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { listarContadores } from "@/lib/clientes/contadores";
import { podeCriarCliente, podeAtribuirContador } from "@/lib/clientes/permissoes";
import { FormCliente } from "@/components/FormCliente";
import { criarCliente } from "../actions";
import type { Papel } from "@/lib/tipos";

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
  const papel = eu?.papel as Papel | undefined;
  if (!podeCriarCliente(papel)) redirect("/clientes"); // financeiro não cria

  // admin/assistente escolhem o contador; contador é forçado a si mesmo (trigger).
  const contadorEditavel = podeAtribuirContador(papel, "novo");
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
