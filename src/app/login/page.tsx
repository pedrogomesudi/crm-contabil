import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { LoginForm } from "@/components/LoginForm";

export const metadata = { title: "Entrar" };

const AVISOS: Record<string, string> = {
  link_invalido: "O link expirou ou é inválido. Solicite um novo convite ou recuperação de senha.",
  conta_inativa: "Sua conta está inativa. Procure um administrador do escritório.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string }>;
}) {
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
  const { erro } = await searchParams;
  const aviso = erro ? AVISOS[erro] : undefined;
  return <LoginForm aviso={aviso} />;
}
