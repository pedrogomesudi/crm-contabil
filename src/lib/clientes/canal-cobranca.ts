// Mapeamento entre a escolha do usuário (3 opções) e os dois flags persistidos em
// clientes_financeiro. Puro e sem I/O — reusado no cadastro, na aba Financeiro e no envio.
export type CanalCobranca = "whatsapp" | "email" | "ambos";

export function canalParaFlags(canal: CanalCobranca): { whatsapp: boolean; email: boolean } {
  return {
    whatsapp: canal === "whatsapp" || canal === "ambos",
    email: canal === "email" || canal === "ambos",
  };
}

// Deriva o canal a partir dos flags. Sem nenhum flag ligado (caso legado/silenciado) cai em
// "ambos" — o default histórico — para nunca renderizar um seletor vazio.
export function flagsParaCanal(f: { whatsapp?: boolean | null; email?: boolean | null }): CanalCobranca {
  const wa = f.whatsapp ?? true;
  const em = f.email ?? true;
  if (wa && !em) return "whatsapp";
  if (!wa && em) return "email";
  return "ambos";
}
