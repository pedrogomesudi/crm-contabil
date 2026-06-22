import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { NovaSenhaForm } from "@/components/NovaSenhaForm";

export const metadata = { title: "Definir nova senha" };

// Só acessível com sessão (de recuperação) criada pelo /auth/confirmar.
export default async function RedefinirSenhaPage() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return <NovaSenhaForm />;
}
