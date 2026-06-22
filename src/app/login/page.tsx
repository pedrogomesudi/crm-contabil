import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { LoginForm } from "@/components/LoginForm";

export const metadata = { title: "Entrar" };

export default async function LoginPage() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect("/");

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100">
      <LoginForm />
    </main>
  );
}
