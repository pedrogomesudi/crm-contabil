import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { LoginForm } from "@/components/LoginForm";

export const metadata = { title: "Entrar" };

export default async function LoginPage() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    // Só manda ao app se o perfil existir e estiver ativo. Checagem simétrica à
    // do layout (app) — evita loop de redirect com perfil ausente/inativo.
    const { data: perfil } = await supabase
      .from("usuarios")
      .select("ativo")
      .eq("id", user.id)
      .single();
    if (perfil?.ativo) redirect("/");
  }
  return <LoginForm />;
}
