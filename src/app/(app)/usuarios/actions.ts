"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { required } from "@/lib/env";
import { PAPEIS_EQUIPE, type Papel } from "@/lib/tipos";
import type { EstadoConvite } from "./estados";

// Todas as operações de usuário são privilegiadas: exigem admin e rodam com
// service_role (server-side). getPerfilAtual valida o papel a cada chamada.
async function exigirAdmin() {
  const perfil = await getPerfilAtual();
  // Actions rodam fora do layout: re-checa sessão, papel E ativo (admin desativado
  // com cookie ainda válido não pode operar via service_role).
  if (!perfil || !perfil.ativo || perfil.papel !== "admin") redirect("/");
  return perfil;
}

function papelValido(p: string): p is Papel {
  return (PAPEIS_EQUIPE as readonly string[]).includes(p);
}

const emailSchema = z.string().email();

// Conta admins ATIVOS além de `exceto`. Sustenta a invariante "≥1 admin ativo":
// o trigger garantir_admin_ativo (migration 0010) é a barreira final no banco;
// aqui só antecipamos a mensagem amigável.
async function outrosAdminsAtivos(admin: ReturnType<typeof createAdminSupabase>, exceto: string): Promise<number> {
  const { count } = await admin
    .from("usuarios")
    .select("id", { count: "exact", head: true })
    .eq("papel", "admin")
    .eq("ativo", true)
    .neq("id", exceto);
  return count ?? 0;
}

export async function convidarUsuario(_prev: EstadoConvite, formData: FormData): Promise<EstadoConvite> {
  await exigirAdmin();
  const emailBruto = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const nome = String(formData.get("nome") ?? "").trim();
  const papel = String(formData.get("papel") ?? "");
  if (!emailBruto || !nome) return { erro: "Informe e-mail e nome." };
  const email = emailSchema.safeParse(emailBruto);
  if (!email.success) return { erro: "E-mail inválido." };
  if (!papelValido(papel)) return { erro: "Papel inválido." };

  const admin = createAdminSupabase();
  const site = required(process.env.NEXT_PUBLIC_SITE_URL, "NEXT_PUBLIC_SITE_URL");
  // inviteUserByEmail cria o usuário E envia o e-mail de convite (via SMTP/Brevo)
  // usando o template "Invite user". redirectTo explícito torna o link robusto a
  // divergência entre o Site URL do painel e o ambiente real.
  const { data: convidado, error: errConvite } = await admin.auth.admin.inviteUserByEmail(email.data, {
    redirectTo: `${site}/auth/confirmar`,
  });
  if (errConvite || !convidado?.user) {
    const jaExiste = /exist|registered|already/i.test(errConvite?.message ?? "");
    if (!jaExiste) console.error("convidarUsuario (invite):", errConvite?.message);
    return { erro: jaExiste ? "E-mail já cadastrado." : "Não foi possível enviar o convite." };
  }

  // Papel/nome definidos EXPLICITAMENTE (o trigger cria como assistente por causa
  // do timing do app_metadata). Se o upsert falhar, o usuário já existe e já recebeu
  // o e-mail: revalida para que ele apareça na lista e o admin corrija o papel ali.
  const { error: errPerfil } = await admin
    .from("usuarios")
    .upsert({ id: convidado.user.id, email: email.data, nome, papel, ativo: true }, { onConflict: "id" });
  revalidatePath("/usuarios");
  if (errPerfil) {
    console.error("convidarUsuario (upsert papel):", errPerfil.message);
    return { erro: "Convite enviado, mas o papel não foi definido. Ajuste-o na lista abaixo." };
  }
  return { ok: true };
}

export async function alterarPapel(usuarioId: string, formData: FormData) {
  const eu = await exigirAdmin();
  if (usuarioId === eu.id) redirect("/usuarios?erro=self"); // não altera o próprio papel
  const papel = String(formData.get("papel") ?? "");
  if (!papelValido(papel)) redirect("/usuarios?erro=papel");

  const admin = createAdminSupabase();
  // Não rebaixar o último admin ativo (mensagem amigável; o trigger é a barreira final).
  if (papel !== "admin") {
    const { data: atual } = await admin.from("usuarios").select("papel, ativo").eq("id", usuarioId).maybeSingle();
    if (atual?.papel === "admin" && atual.ativo && (await outrosAdminsAtivos(admin, usuarioId)) === 0) {
      redirect("/usuarios?erro=ultimo_admin");
    }
  }

  const { error } = await admin.from("usuarios").update({ papel }).eq("id", usuarioId);
  if (error) {
    console.error("alterarPapel:", error.message);
    redirect("/usuarios?erro=1");
  }
  revalidatePath("/usuarios");
  redirect("/usuarios?ok=papel");
}

// Alterna o status do usuário lendo o valor ATUAL no servidor (evita aplicar um
// valor obsoleto fixado no render). Não desativa o último admin ativo.
export async function definirAtivo(usuarioId: string) {
  const eu = await exigirAdmin();
  if (usuarioId === eu.id) redirect("/usuarios?erro=self"); // não desativa a si mesmo

  const admin = createAdminSupabase();
  const { data: atual, error: errLer } = await admin
    .from("usuarios")
    .select("papel, ativo")
    .eq("id", usuarioId)
    .maybeSingle();
  if (errLer || !atual) {
    if (errLer) console.error("definirAtivo (ler):", errLer.message);
    redirect("/usuarios?erro=1");
  }

  const novoAtivo = !atual.ativo;
  if (!novoAtivo && atual.papel === "admin" && (await outrosAdminsAtivos(admin, usuarioId)) === 0) {
    redirect("/usuarios?erro=ultimo_admin");
  }

  const { error } = await admin.from("usuarios").update({ ativo: novoAtivo }).eq("id", usuarioId);
  if (error) {
    console.error("definirAtivo:", error.message);
    redirect("/usuarios?erro=1");
  }
  revalidatePath("/usuarios");
  redirect("/usuarios?ok=status");
}

// Reenvia o link de acesso por e-mail (convite expirado ou usuário que ainda não
// definiu a senha). Usa resetPasswordForEmail: cai no mesmo /auth/confirmar e
// permite definir a senha. Resposta neutra mesmo se o e-mail não existir mais.
export async function reenviarAcesso(usuarioId: string) {
  await exigirAdmin();
  const admin = createAdminSupabase();
  const { data: alvo, error: errLer } = await admin.from("usuarios").select("email").eq("id", usuarioId).maybeSingle();
  if (errLer || !alvo?.email) {
    if (errLer) console.error("reenviarAcesso (ler):", errLer.message);
    redirect("/usuarios?erro=1");
  }

  const site = required(process.env.NEXT_PUBLIC_SITE_URL, "NEXT_PUBLIC_SITE_URL");
  const { error } = await admin.auth.resetPasswordForEmail(alvo.email, {
    redirectTo: `${site}/auth/confirmar`,
  });
  if (error) {
    console.error("reenviarAcesso (envio):", error.message);
    redirect("/usuarios?erro=1");
  }
  redirect("/usuarios?ok=reenviado");
}

// Troca o e-mail de login PRESERVANDO o usuário. Criar outro e desativar o antigo seria
// o caminho fácil e errado: o id do usuário é referenciado em ~90 pontos do schema (quem
// cadastrou o cliente, quem é o contador responsável, quem revisou a obrigação), e o
// histórico ficaria preso a alguém inativo.
//
// Vale para o PRÓPRIO usuário — diferente de papel e status, trocar o próprio e-mail é o
// caso de uso comum (mudança de domínio) e não permite se trancar para fora: a senha não
// muda, e quem faz a troca está vendo o endereço novo na tela.
export async function alterarEmail(usuarioId: string, formData: FormData) {
  await exigirAdmin();
  const bruto = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const email = emailSchema.safeParse(bruto);
  if (!email.success) redirect("/usuarios?erro=email_invalido");

  const admin = createAdminSupabase();

  const { data: atual } = await admin.from("usuarios").select("email").eq("id", usuarioId).maybeSingle();
  if (atual?.email?.toLowerCase() === email.data) redirect("/usuarios?ok=email"); // nada a fazer

  // Outro usuário já usa esse endereço: o Auth recusaria adiante, mas com mensagem crua.
  const { data: ocupado } = await admin.from("usuarios").select("id").ilike("email", email.data).maybeSingle();
  if (ocupado && ocupado.id !== usuarioId) redirect("/usuarios?erro=email_em_uso");

  // 1) Auth primeiro: é ele que decide com o que se entra. `email_confirm` evita mandar
  //    o usuário confirmar um endereço que um admin já confirmou deliberadamente.
  const { error: errAuth } = await admin.auth.admin.updateUserById(usuarioId, {
    email: email.data,
    email_confirm: true,
  });
  if (errAuth) {
    console.error("alterarEmail (auth):", errAuth.message);
    redirect(/already|exist|registered/i.test(errAuth.message) ? "/usuarios?erro=email_em_uso" : "/usuarios?erro=1");
  }

  // 2) Espelho na tabela. Se ESTE passo falhar, o login já é o novo e a tela mostra o
  //    antigo — repetir a operação conserta (o passo 1 é idempotente).
  const { error } = await admin.from("usuarios").update({ email: email.data }).eq("id", usuarioId);
  if (error) {
    console.error("alterarEmail (perfil):", error.message);
    redirect("/usuarios?erro=email_parcial");
  }

  revalidatePath("/usuarios");
  redirect("/usuarios?ok=email");
}

export async function definirSuperior(usuarioId: string, formData: FormData) {
  await exigirAdmin();
  const bruto = String(formData.get("superior_id") ?? "");
  const superiorId = bruto === "" ? null : bruto;
  if (superiorId === usuarioId) return; // não pode ser superior de si mesmo
  const admin = createAdminSupabase();
  // proteção contra ciclo: sobe a partir do superior escolhido
  if (superiorId) {
    let cur: string | null = superiorId;
    const visto = new Set<string>();
    while (cur) {
      if (cur === usuarioId) return; // fecharia um ciclo — rejeita
      if (visto.has(cur)) break;
      visto.add(cur);
      const res: { data: { superior_id: string | null } | null } = await admin
        .from("usuarios")
        .select("superior_id")
        .eq("id", cur)
        .maybeSingle();
      cur = res.data?.superior_id ?? null;
    }
  }
  await admin.from("usuarios").update({ superior_id: superiorId }).eq("id", usuarioId);
  revalidatePath("/usuarios");
}

// Departamento do colaborador: é a ORIGEM das solicitações internas (RF-045) e evita
// que a pessoa precise reescolhê-lo a cada pedido.
export async function definirDepartamento(usuarioId: string, formData: FormData) {
  const eu = await exigirAdmin();
  if (!eu) return;
  const bruto = String(formData.get("departamento") ?? "");
  const departamento = bruto === "" ? null : bruto;
  const admin = createAdminSupabase();
  await admin.from("usuarios").update({ departamento }).eq("id", usuarioId);
  revalidatePath("/usuarios");
}

// Reset de 2FA pela admin: remove TODOS os fatores MFA do usuário (recuperação de "perdi o
// autenticador"). Rebaixa a sessão dele para aal1; no próximo acesso ele reconfigura. Não há
// códigos de backup no v1 — este é o caminho de recuperação.
export async function resetarMfa(usuarioId: string) {
  await exigirAdmin();
  const admin = createAdminSupabase();

  const { data, error } = await admin.auth.admin.mfa.listFactors({ userId: usuarioId });
  if (error) {
    console.error("resetarMfa (listar):", error.message);
    redirect("/usuarios?erro=1");
  }

  for (const fator of data?.factors ?? []) {
    const { error: errDel } = await admin.auth.admin.mfa.deleteFactor({ id: fator.id, userId: usuarioId });
    if (errDel) {
      console.error("resetarMfa (excluir):", errDel.message);
      redirect("/usuarios?erro=1");
    }
  }

  revalidatePath("/usuarios");
  redirect("/usuarios?ok=mfa");
}
