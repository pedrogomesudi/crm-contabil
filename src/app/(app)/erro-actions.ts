"use server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { montarErroCliente } from "@/lib/observabilidade/erroCliente";

// Registra um erro capturado NO NAVEGADOR. Gate de equipe ativa: a action é alcançável por
// qualquer sessão, e sem isso vira um jeito de encher a tabela de erros de fora.
// Nunca lança: é chamada de dentro de um error boundary, onde uma segunda falha deixaria a
// pessoa sem nem a tela de erro.
export async function registrarErroCliente(erro: { message?: string; stack?: string; digest?: string }, rota: string) {
  try {
    const perfil = await getPerfilAtual();
    if (!perfil?.ativo) return;
    const linha = montarErroCliente(erro, rota, "(via server action)");
    await createAdminSupabase().from("evento_erro").insert(linha);
  } catch {
    // engolir: o relato de erro não pode ser a causa de outro
  }
}
