const RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const LIMITES = { assunto: 200, corpo: 20_000, anexosBytes: 10 * 1024 * 1024 };

export function emailValido(v: string): boolean {
  return RE.test(String(v ?? "").trim());
}

export function validarEnvio(i: { para: string; assunto: string; corpo: string }): string | null {
  if (!emailValido(i.para)) return "Informe o destinatário.";
  if (!i.assunto.trim()) return "Informe o assunto.";
  if (!i.corpo.trim()) return "Escreva a mensagem.";
  if (i.assunto.length > LIMITES.assunto) return "Assunto muito longo.";
  if (i.corpo.length > LIMITES.corpo) return "Mensagem muito longa.";
  return null;
}
