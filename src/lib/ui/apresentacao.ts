// 2 iniciais de um nome (composto → 1ª de cada uma das 2 primeiras palavras; 1 palavra → 2 letras).
export function iniciais(nome: string): string {
  const partes = String(nome ?? "").trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "?";
  if (partes.length === 1) return partes[0]!.slice(0, 2).toUpperCase();
  return (partes[0]![0]! + partes[1]![0]!).toUpperCase();
}

// Regime tributário → variante de cor do Badge.
export function badgeRegime(regime: string | null): "positivo" | "ia" | "neutro" | "atencao" {
  const r = (regime ?? "").toLowerCase();
  if (r.includes("simples")) return "positivo";
  if (r.includes("presumido")) return "ia";
  if (r.includes("mei")) return "atencao";
  return "neutro";
}

// Status do título → variante de cor do Badge.
export function badgeStatusTitulo(status: string): "positivo" | "atencao" | "negativo" | "neutro" {
  const s = (status ?? "").toUpperCase();
  if (s === "BAIXADO") return "positivo";
  if (s === "BAIXADO_PARCIAL") return "atencao";
  if (s === "VENCIDO") return "negativo";
  return "neutro";
}

// Status da NFS-e → variante de cor do Badge.
export function badgeStatusNfse(status: string): "positivo" | "neutro" | "negativo" | "atencao" {
  const s = (status ?? "").toLowerCase();
  if (s.includes("autorizada")) return "positivo";
  if (s.includes("rejeit") || s.includes("erro") || s.includes("falha")) return "negativo";
  if (s.includes("process") || s.includes("pendente") || s.includes("enviada")) return "atencao";
  return "neutro"; // cancelada e desconhecidos
}
