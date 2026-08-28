import { normalizarTelefone } from "@/lib/whatsapp/mensagem";

// Contatos do cliente + as escolhas de "usar no envio" por contato. Os campos usam o mesmo nome
// das colunas de `clientes` para facilitar o mapeamento direto do select.
export type ContatosEnvio = {
  email?: string | null;
  email_envio?: boolean | null;
  email_2?: string | null;
  email_2_envio?: boolean | null;
  telefone?: string | null;
  telefone_ddi?: string | null;
  whatsapp_envio?: boolean | null;
  telefone_2?: string | null;
  telefone_ddi_2?: string | null;
  whatsapp_2_envio?: boolean | null;
};

// E-mails que devem receber (principal e/ou 2º, conforme os flags). Sem duplicatas, minúsculas.
// Defaults: principal ligado, 2º desligado — preserva o comportamento de quem não configurou.
export function emailsDeEnvio(c: ContatosEnvio): string[] {
  const out: string[] = [];
  if ((c.email_envio ?? true) && c.email?.trim()) out.push(c.email.trim().toLowerCase());
  if ((c.email_2_envio ?? false) && c.email_2?.trim()) out.push(c.email_2.trim().toLowerCase());
  return [...new Set(out)];
}

// Telefones (formato Z-API) que devem receber (principal e/ou 2º, conforme os flags). Sem duplicatas.
export function telefonesDeEnvio(c: ContatosEnvio): string[] {
  const out: string[] = [];
  if (c.whatsapp_envio ?? true) {
    const t = normalizarTelefone(c.telefone ?? "", c.telefone_ddi ?? "55");
    if (t) out.push(t);
  }
  if (c.whatsapp_2_envio ?? false) {
    const t = normalizarTelefone(c.telefone_2 ?? "", c.telefone_ddi_2 ?? "55");
    if (t) out.push(t);
  }
  return [...new Set(out)];
}
