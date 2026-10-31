import type { EventoErroLinha } from "./eventoErro";

// Limites: o navegador é entrada NÃO CONFIÁVEL (qualquer um pode chamar a action com o que
// quiser) e a tabela de erros não é depósito. Cortar aqui é defesa, não economia.
export const LIMITE_MENSAGEM = 2000;
export const LIMITE_STACK = 6000;
const LIMITE_CURTO = 300;

function corta(v: unknown, max: number): string | null {
  return typeof v === "string" && v.length > 0 ? v.slice(0, max) : null;
}

// Monta a linha de evento_erro para um erro capturado NO NAVEGADOR. O sistema só registrava
// erro de servidor (instrumentation.ts) — uma tela que quebra no celular era invisível, e foi
// isso que transformou o diagnóstico do Atendimento em dedução. Defensivo de ponta a ponta:
// roda quando algo JÁ deu errado, então nada aqui pode lançar.
export function montarErroCliente(
  erro: { message?: unknown; stack?: unknown; digest?: unknown },
  rota: unknown,
  userAgent: unknown,
): EventoErroLinha {
  return {
    mensagem: corta(erro?.message, LIMITE_MENSAGEM) ?? "(sem mensagem)",
    rota: corta(rota, LIMITE_CURTO),
    metodo: "GET",
    digest: corta(erro?.digest, LIMITE_CURTO),
    tipo_rota: "cliente",
    stack: corta(erro?.stack, LIMITE_STACK),
    // `origem` é o que distingue estas linhas das do servidor na tela de Observabilidade.
    contexto: { origem: "navegador", userAgent: corta(userAgent, LIMITE_CURTO) ?? "(desconhecido)" },
  };
}
