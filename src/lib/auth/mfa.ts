// Níveis de garantia de autenticação (AAL) da sessão, como o Supabase os expõe em
// getAuthenticatorAssuranceLevel(). currentLevel = onde a sessão está; nextLevel = até
// onde ela poderia ir. nextLevel === "aal2" só acontece quando há fator VERIFICADO.
export type NivelAal = { currentLevel: string | null; nextLevel: string | null };

// Decisão pura do gate de MFA. Sem I/O: recebe o AAL da sessão e se o escritório exige 2FA.
// - "verificar": tem fator verificado (nextLevel aal2) mas a sessão ainda é aal1 → desafiar.
// - "enrollar":  não tem fator (nextLevel aal1) e o escritório exige → forçar cadastro (Fatia B).
// - "ok":        segue normal (sem fator e opcional, ou sessão já aal2, ou AAL indisponível).
export function decidirGateAal(aal: NivelAal, obrigatorio: boolean): "verificar" | "enrollar" | "ok" {
  if (aal.nextLevel === "aal2" && aal.currentLevel === "aal1") return "verificar";
  if (obrigatorio && aal.nextLevel === "aal1") return "enrollar";
  return "ok";
}

// Código TOTP é sempre 6 dígitos numéricos. Aparadas as bordas (o usuário cola com espaço).
export function codigoTotpValido(codigo: string): boolean {
  return /^\d{6}$/.test(codigo.trim());
}
