export const MARCADOR = "[anonimizado]";

// Campos PESSOAIS não-fiscais de `clientes` que podem ser anonimizados. NUNCA inclui
// razao_social, cpf_cnpj nem inscricoes: dado de PJ / fiscal, sob obrigação de guarda.
export const CAMPOS_CLIENTE_ANONIMIZAVEIS = ["email", "telefone", "responsavel_nome", "representante"];

// O valor anonimizado por campo: `representante` é jsonb (vira null); o resto é texto
// (vira o marcador). Endereço fica de fora — é de PJ, não do titular.
export function anonimizarValor(campo: string): string | null {
  if (campo === "representante") return null;
  return MARCADOR;
}

// Monta o patch de UPDATE de `clientes` para a anonimização.
export function patchAnonimizacao(): Record<string, string | null> {
  const patch: Record<string, string | null> = {};
  for (const c of CAMPOS_CLIENTE_ANONIMIZAVEIS) patch[c] = anonimizarValor(c);
  return patch;
}
