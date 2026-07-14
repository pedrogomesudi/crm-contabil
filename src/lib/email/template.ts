import { aplicarTemplate } from "@/lib/whatsapp/mensagem";
import { formatarData } from "@/lib/format";

// Mesma sintaxe {chave} da régua do WhatsApp — a equipe já conhece.
export const VARIAVEIS: { chave: string; rotulo: string }[] = [
  { chave: "nome", rotulo: "Razão social do cliente" },
  { chave: "cnpj", rotulo: "CNPJ" },
  { chave: "email", rotulo: "E-mail do cliente" },
  { chave: "escritorio", rotulo: "Nome do escritório" },
  { chave: "hoje", rotulo: "Data de hoje" },
  { chave: "valor", rotulo: "Valor do título (envio a partir de cobrança)" },
  { chave: "vencimento", rotulo: "Vencimento do título" },
  { chave: "competencia", rotulo: "Competência" },
];

export function variaveisDoCliente(
  c: { razaoSocial: string; cnpj: string | null; email: string | null },
  escritorio: string,
  hojeIso: string,
): Record<string, string> {
  return {
    nome: c.razaoSocial,
    cnpj: c.cnpj ?? "",
    email: c.email ?? "",
    escritorio,
    hoje: formatarData(hojeIso),
  };
}

export function aplicarEmail(
  tpl: { assunto: string; corpo: string },
  vars: Record<string, string>,
): { assunto: string; corpo: string } {
  return { assunto: aplicarTemplate(tpl.assunto, vars), corpo: aplicarTemplate(tpl.corpo, vars) };
}

// O corpo é texto; o HTML é derivado com escape. Nunca aceitamos HTML cru — senão o
// template vira vetor de injeção no cliente de e-mail de quem recebe.
export function htmlDoTexto(texto: string): string {
  const esc = texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
  return esc.replace(/\n/g, "<br>");
}
