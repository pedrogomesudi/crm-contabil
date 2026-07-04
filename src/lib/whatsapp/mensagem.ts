// Normaliza para o formato Z-API: DDI 55 + DDD + número, só dígitos.
// Aceita números BR de 10–11 dígitos (adiciona 55) ou já com 55 (12–13). Senão null.
export function normalizarTelefone(bruto: string): string | null {
  const d = String(bruto ?? "").replace(/\D/g, "");
  if (d.length === 10 || d.length === 11) return `55${d}`;
  if ((d.length === 12 || d.length === 13) && d.startsWith("55")) return d;
  return null;
}

// Substitui {chave} pelo valor; chaves ausentes viram "".
export function aplicarTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? "");
}

export const TEMPLATES = {
  cobranca:
    "Olá {nome}! Consta em aberto o valor de {valor}, com vencimento em {vencimento}. " +
    "Se já efetuou o pagamento, por favor desconsidere. Qualquer dúvida, estamos à disposição.",
  aviso_vencimento:
    "Olá {nome}! Lembrete: o honorário de {valor} vence em {vencimento}. Obrigado!",
};
