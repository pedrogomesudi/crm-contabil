import { redirect } from "next/navigation";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { listarContadores } from "@/lib/clientes/contadores";
import { podeCriarCliente, podeAtribuirContador } from "@/lib/clientes/permissoes";
import { FormCliente } from "@/components/FormCliente";
import { criarCliente } from "../actions";

export const metadata = { title: "Novo cliente" };

export default async function NovoClientePage() {
  const perfil = await getPerfilAtual();
  if (!perfil) redirect("/login");
  const papel = perfil.papel;
  if (!podeCriarCliente(papel)) redirect("/clientes"); // financeiro não cria

  // admin/assistente escolhem o contador; contador é forçado a si mesmo (trigger).
  const contadorEditavel = podeAtribuirContador(papel, "novo");
  const contadores = contadorEditavel ? await listarContadores() : [];

  return (
    <div>
      <h1 className="mb-4 font-display text-2xl font-bold tracking-tight text-texto">Novo cliente</h1>
      <FormCliente
        action={criarCliente}
        contadores={contadores}
        modo="novo"
        contadorEditavel={contadorEditavel}
      />
    </div>
  );
}
