import { aplicarTemplate } from "@/lib/whatsapp/mensagem";

export type EstadoCanal = {
  whatsappConfigurado: boolean;
  // LISTAS, não campos únicos: o cliente pode ter 2 contatos marcados para envio e a régua
  // precisa alcançar os dois. Já normalizados e filtrados pelos flags de "usar no envio".
  telefones: string[];
  optOutWhatsapp: boolean; // clientes_financeiro.cobranca_whatsapp === false
  emailFallbackLigado: boolean; // email_config.regua_email_fallback
  emailConfigurado: boolean; // email_config.provedor preenchido
  emails: string[];
  optOutEmail: boolean; // clientes_financeiro.cobranca_email === false
};

export type Canal = "whatsapp" | "email" | "nenhum";

export function podeWhatsapp(e: EstadoCanal): boolean {
  return e.whatsappConfigurado && e.telefones.length > 0 && !e.optOutWhatsapp;
}

export function podeEmail(e: EstadoCanal): boolean {
  return e.emailFallbackLigado && e.emailConfigurado && e.emails.length > 0 && !e.optOutEmail;
}

// Primeiro canal a tentar. Se o WhatsApp falhar NO ENVIO, o motor ainda consulta
// podeEmail() para cair para o e-mail — é o 4º motivo de fallback do spec.
export function decidirCanal(e: EstadoCanal): { canal: Canal; motivo: string } {
  if (podeWhatsapp(e)) return { canal: "whatsapp", motivo: "WhatsApp disponível." };
  if (podeEmail(e)) return { canal: "email", motivo: "WhatsApp indisponível — cai para e-mail." };
  return { canal: "nenhum", motivo: "Nenhum canal disponível para este cliente." };
}

// Canal escolhido MAIS os destinatários daquele canal. A escolha do canal é por CLIENTE (como
// sempre foi); escolhido o canal, a mensagem vai para todos os contatos marcados dele. O
// fallback para e-mail só ocorre se o WhatsApp falhar para TODOS os destinos — por destino
// isoladamente, um número inválido geraria cobrança em dobro, pelos dois canais.
export function destinosDaRegua(e: EstadoCanal): { canal: Canal; destinos: string[] } {
  const { canal } = decidirCanal(e);
  if (canal === "whatsapp") return { canal, destinos: e.telefones };
  if (canal === "email") return { canal, destinos: e.emails };
  return { canal, destinos: [] };
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
