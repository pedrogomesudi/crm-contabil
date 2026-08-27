// Mapeamento entre a escolha do usuário e os dois flags persistidos em clientes_financeiro.
// Puro e sem I/O — reusado no cadastro, na aba Financeiro e nos fluxos de honorário.
// "nao_enviar" = os dois canais desligados: o cliente sai do ciclo automático (nem mensalidade,
// nem NF, nem boleto). O contas a receber dele passa a ser lançado só manualmente.
export type CanalCobranca = "whatsapp" | "email" | "ambos" | "nao_enviar";

export function canalParaFlags(canal: CanalCobranca): { whatsapp: boolean; email: boolean } {
  return {
    whatsapp: canal === "whatsapp" || canal === "ambos",
    email: canal === "email" || canal === "ambos",
  };
}

// Deriva o canal a partir dos flags. Um flag ausente (null) conta como ligado — o default
// histórico (default do banco é true) —, então só cai em "nao_enviar" quando os DOIS estão
// explicitamente desligados.
export function flagsParaCanal(f: { whatsapp?: boolean | null; email?: boolean | null }): CanalCobranca {
  const wa = f.whatsapp ?? true;
  const em = f.email ?? true;
  if (wa && em) return "ambos";
  if (wa) return "whatsapp";
  if (em) return "email";
  return "nao_enviar";
}

// Verdadeiro quando o cliente optou por "Não enviar" (nenhum canal). Usado para excluí-lo da
// geração de mensalidades, da emissão de NF e da geração de boletos em lote.
export function naoEnviaHonorario(f: { whatsapp?: boolean | null; email?: boolean | null }): boolean {
  return flagsParaCanal(f) === "nao_enviar";
}
