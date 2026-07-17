// Monta o número no formato Z-API: DDI + número local, só dígitos.
// O ddi vem do cadastro (coluna telefone_ddi); default "55" preserva o comportamento brasileiro
// de quem chama com um argumento só.
export function normalizarTelefone(local: string, ddi: string = "55"): string | null {
  const d = String(local ?? "").replace(/\D/g, "");
  const dd = String(ddi ?? "55").replace(/\D/g, "") || "55";
  // Compat: número BR que já vem com o 55 na frente (dados/webhook antigos, 12–13 díg) é respeitado.
  // Exige dd === "55" para não confundir um número de outro país que por acaso comece com 55.
  if (dd === "55" && (d.length === 12 || d.length === 13) && d.startsWith("55")) return d;
  if (d.length < 6 || d.length > 15) return null; // fora do intervalo E.164 plausível
  return `${dd}${d}`;
}

// Chave canônica para casar conversas. Só o WhatsApp brasileiro tem o nono dígito volátil (que o
// WhatsApp ora envia, ora omite); para os demais países a chave é o número inteiro (DDI + local),
// sem inserir nada.
export function chaveTelefone(local: string, ddi: string = "55"): string | null {
  const t = normalizarTelefone(local, ddi);
  if (!t) return null;
  if (!t.startsWith("55")) return t; // não-BR: como está
  const resto = t.slice(2); // DDD + número local
  if (resto.length === 10) return `55${resto.slice(0, 2)}9${resto.slice(2)}`; // 12 díg (sem 9) → insere o 9
  return t; // 13 díg (já com o 9)
}

// Substitui {chave} pelo valor; chaves ausentes viram "".
export function aplicarTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? "");
}

export const TEMPLATES = {
  cobranca:
    "Olá {nome}! Consta em aberto o valor de {valor}, com vencimento em {vencimento}. " +
    "Se já efetuou o pagamento, por favor desconsidere. Qualquer dúvida, estamos à disposição.",
  aviso_vencimento: "Olá {nome}! Lembrete: o honorário de {valor} vence em {vencimento}. Obrigado!",
};
