import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { required } from "@/lib/env";

// Next 16: a convenção middleware.ts virou proxy.ts (função `proxy`).
// Responsabilidade ÚNICA: manter a sessão do Supabase viva (refresh do token).
// A proteção de rota (redirecionar deslogado) é feita no layout do grupo (app)
// via getUser() em Server Component — não aqui (padrão @supabase/ssr).
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient(
    required(process.env.NEXT_PUBLIC_SUPABASE_URL, "NEXT_PUBLIC_SUPABASE_URL"),
    required(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, "NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (toSet) => {
          toSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          toSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );
  // Falha de rede ao renovar o token não deve derrubar a request: degrada para
  // "sessão não renovada nesta request" (a próxima tenta de novo).
  try {
    await supabase.auth.getUser();
  } catch {
    // ignora: o refresh é best-effort
  }
  return response;
}

export const config = {
  // Exclui assets estáticos, imagens do Next e a rota de health do refresh de sessão.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/health|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|txt|xml)$).*)",
  ],
};
