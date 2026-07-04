import { redirect } from "next/navigation";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createServerSupabase } from "@/lib/supabase/server";
import { podeConfigurarWhatsapp } from "@/lib/clientes/permissoes";
import { FormWhatsapp } from "./Formularios";

export default async function ConfigWhatsappPage() {
  const perfil = await getPerfilAtual();
  if (!perfil || !podeConfigurarWhatsapp(perfil.papel)) redirect("/");
  const supabase = await createServerSupabase();
  const { data } = await supabase.from("whatsapp_config").select("instance, token_cifrado").eq("id", 1).maybeSingle();
  return (
    <main className="mx-auto max-w-2xl space-y-4 p-4">
      <h1 className="text-lg font-semibold text-slate-900">WhatsApp (Z-API)</h1>
      <FormWhatsapp instance={data?.instance ?? ""} configurado={Boolean(data?.token_cifrado)} />
    </main>
  );
}
