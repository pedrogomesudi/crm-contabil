import { aplicarTemplate } from "@/lib/whatsapp/mensagem";

export type EstadoCanal = {
  whatsappConfigurado: boolean;
  telefone: string | null; // já normalizado (null = ausente/inválido)
  optOutWhatsapp: boolean; // clientes_financeiro.cobranca_whatsapp === false
  emailFallbackLigado: boolean; // email_config.regua_email_fallback
  emailConfigurado: boolean; // email_config.provedor preenchido
  email: string | null;
  optOutEmail: boolean; // clientes_financeiro.cobranca_email === false
};

export type Canal = "whatsapp" | "email" | "nenhum";

export function podeWhatsapp(e: EstadoCanal): boolean {
  return e.whatsappConfigurado && Boolean(e.telefone) && !e.optOutWhatsapp;
}

export function podeEmail(e: EstadoCanal): boolean {
  return e.emailFallbackLigado && e.emailConfigurado && Boolean(e.email) && !e.optOutEmail;
}

// Primeiro canal a tentar. Se o WhatsApp falhar NO ENVIO, o motor ainda consulta
// podeEmail() para cair para o e-mail — é o 4º motivo de fallback do spec.
export function decidirCanal(e: EstadoCanal): { canal: Canal; motivo: string } {
  if (podeWhatsapp(e)) return { canal: "whatsapp", motivo: "WhatsApp disponível." };
  if (podeEmail(e)) return { canal: "email", motivo: "WhatsApp indisponível — cai para e-mail." };
  return { canal: "nenhum", motivo: "Nenhum canal disponível para este cliente." };
}

export function conteudoEmail(
  etapa: { template: string; email_assunto: string | null; email_corpo: string | null },
  vars: Record<string, string>,
): { assunto: string; corpo: string } {
  // Sem conteúdo próprio, reaproveita o texto do WhatsApp: a régua não pode ficar muda
  // justamente no cenário em que o fallback importa (banimento inesperado do número).
  const corpo = aplicarTemplate(etapa.email_corpo?.trim() || etapa.template, vars);
  const assunto = aplicarTemplate(etapa.email_assunto?.trim() || "Cobrança — {nome}", vars);
  return { assunto, corpo };
}
