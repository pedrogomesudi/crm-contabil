import type { Instrumentation } from "next";

// Captura erros server-side não tratados (route handler / server component / server action) e
// grava em evento_erro. Best-effort: nunca lança (logar não pode derrubar o request). Pula o
// runtime edge — o client admin é Node-only. Imports dinâmicos mantêm o módulo leve fora do Node.
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  if (process.env.NEXT_RUNTIME === "edge") return;
  try {
    const { montarEventoErro } = await import("@/lib/observabilidade/eventoErro");
    const { createAdminSupabase } = await import("@/lib/supabase/admin");
    const linha = montarEventoErro(err, request, context);
    await createAdminSupabase().from("evento_erro").insert(linha);
  } catch {
    // best-effort: registrar erro não pode derrubar o request.
  }
};
