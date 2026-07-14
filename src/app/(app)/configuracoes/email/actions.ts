"use server";
import { revalidatePath } from "next/cache";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createServerSupabase } from "@/lib/supabase/server";
import { cifrar } from "@/lib/nfse/cripto";
import { required } from "@/lib/env";
import { emailValido } from "@/lib/email/validacao";
import { enviarEmail } from "@/lib/email/enviar";

export type EstadoEmail = { erro?: string; ok?: boolean; enviado?: boolean };

// Status para a tela: NUNCA devolve senha nem chave de API — só se existem.
export type StatusEmail = {
  provedor: "smtp" | "api" | null;
  remetenteNome: string;
  remetenteEmail: string;
  smtpHost: string;
  smtpPorta: number;
  smtpSeguro: boolean;
  smtpUsuario: string;
  apiProvedor: "resend" | "sendgrid" | null;
  temSenha: boolean;
  temChave: boolean;
  reguaFallback: boolean;
};

async function exigirAdmin() {
  const p = await getPerfilAtual();
  return p?.ativo && p.papel === "admin" ? p : null;
}

export async function statusConfig(): Promise<StatusEmail | null> {
  if (!(await exigirAdmin())) return null;
  const supabase = await createServerSupabase();
  const { data: c } = await supabase
    .from("email_config")
    .select(
      "provedor, remetente_nome, remetente_email, smtp_host, smtp_porta, smtp_seguro, smtp_usuario, smtp_senha_cifrada, api_provedor, api_chave_cifrada, regua_email_fallback",
    )
    .eq("id", 1)
    .maybeSingle();
  return {
    provedor: (c?.provedor as "smtp" | "api" | null) ?? null,
    remetenteNome: (c?.remetente_nome as string | null) ?? "",
    remetenteEmail: (c?.remetente_email as string | null) ?? "",
    smtpHost: (c?.smtp_host as string | null) ?? "",
    smtpPorta: (c?.smtp_porta as number | null) ?? 587,
    smtpSeguro: c?.smtp_seguro !== false,
    smtpUsuario: (c?.smtp_usuario as string | null) ?? "",
    apiProvedor: (c?.api_provedor as "resend" | "sendgrid" | null) ?? null,
    temSenha: Boolean(c?.smtp_senha_cifrada),
    temChave: Boolean(c?.api_chave_cifrada),
    reguaFallback: c?.regua_email_fallback !== false,
  };
}

export async function salvarConfigEmail(_prev: EstadoEmail, fd: FormData): Promise<EstadoEmail> {
  const perfil = await exigirAdmin();
  if (!perfil) return { erro: "Apenas admin." };

  const provedor = String(fd.get("provedor") ?? "");
  if (provedor !== "smtp" && provedor !== "api") return { erro: "Escolha o provedor." };

  const remetenteEmail = String(fd.get("remetente_email") ?? "").trim();
  if (!emailValido(remetenteEmail)) return { erro: "E-mail do remetente inválido." };
  const remetenteNome = String(fd.get("remetente_nome") ?? "").trim().slice(0, 120);

  let chaveCripto: string;
  try {
    chaveCripto = required(process.env.EMAIL_CRIPTO_KEY, "EMAIL_CRIPTO_KEY");
  } catch {
    return { erro: "EMAIL_CRIPTO_KEY não configurada no servidor." };
  }

  const dados: Record<string, unknown> = {
    provedor,
    remetente_nome: remetenteNome || null,
    remetente_email: remetenteEmail,
    atualizado_em: new Date().toISOString(),
    atualizado_por: perfil.id,
  };

  if (provedor === "smtp") {
    const host = String(fd.get("smtp_host") ?? "").trim();
    const porta = Number(fd.get("smtp_porta"));
    if (!host) return { erro: "Informe o host do SMTP." };
    if (!Number.isInteger(porta) || porta < 1 || porta > 65535) return { erro: "Porta inválida." };
    dados.smtp_host = host;
    dados.smtp_porta = porta;
    dados.smtp_seguro = fd.get("smtp_seguro") === "on";
    dados.smtp_usuario = String(fd.get("smtp_usuario") ?? "").trim() || null;
    // Senha em branco = manter a atual (a tela nunca a recebeu de volta).
    const senha = String(fd.get("smtp_senha") ?? "");
    if (senha) dados.smtp_senha_cifrada = cifrar(Buffer.from(senha, "utf8"), chaveCripto);
  } else {
    const api = String(fd.get("api_provedor") ?? "");
    if (api !== "resend" && api !== "sendgrid") return { erro: "Escolha o provedor de API." };
    dados.api_provedor = api;
    const apiChave = String(fd.get("api_chave") ?? "").trim();
    if (apiChave) dados.api_chave_cifrada = cifrar(Buffer.from(apiChave, "utf8"), chaveCripto);
  }

  const supabase = await createServerSupabase();
  const { error } = await supabase.from("email_config").update(dados).eq("id", 1);
  if (error) return { erro: "Falha ao salvar a configuração." };
  revalidatePath("/configuracoes/email");
  return { ok: true };
}

// Sem isto, um erro de senha só apareceria quando o primeiro cliente ficasse sem receber.
export async function enviarTeste(_prev: EstadoEmail, fd: FormData): Promise<EstadoEmail> {
  const perfil = await exigirAdmin();
  if (!perfil) return { erro: "Apenas admin." };
  const para = String(fd.get("para") ?? "").trim();
  if (!emailValido(para)) return { erro: "Informe um destinatário válido." };

  const r = await enviarEmail({
    para,
    assunto: "Teste de e-mail — SALDO",
    corpo:
      "Este é um e-mail de teste do seu CRM.\n\n" +
      "Se você recebeu esta mensagem, o canal de e-mail está configurado corretamente.",
  });
  return r.ok ? { enviado: true } : { erro: r.erro };
}

// Interruptor do e-mail como canal de fallback da régua de cobrança (RF-051, fatia B).
export async function setReguaFallback(ligado: boolean): Promise<{ ok?: boolean; erro?: string }> {
  if (!(await exigirAdmin())) return { erro: "Apenas admin." };
  const supabase = await createServerSupabase();
  const { error } = await supabase.from("email_config").update({ regua_email_fallback: ligado }).eq("id", 1);
  if (error) return { erro: "Falha ao alterar." };
  revalidatePath("/configuracoes/email");
  return { ok: true };
}
