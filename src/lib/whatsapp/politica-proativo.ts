export type FluxoProativo = "regua" | "cobranca_manual" | "legalizacao" | "comunicado" | "followup" | "nfse";

export type PoliticaFluxo = "sempre_template" | "janela";

// Fixa no código de propósito: seis interruptores de efeito sutil (custo e variação de texto)
// seriam mais difíceis de entender do que o comportamento certo já embutido.
// 'sempre_template' = dispara sem conversa em curso, a janela quase nunca vale.
// 'janela' = costuma ocorrer com conversa viva; aí o texto livre é gratuito e idêntico à Z-API.
export const POLITICA: Record<FluxoProativo, PoliticaFluxo> = {
  regua: "sempre_template",
  comunicado: "sempre_template",
  nfse: "sempre_template",
  cobranca_manual: "janela",
  legalizacao: "janela",
  followup: "janela",
};

// Contrato: a ORDEM é o que o escritório precisa respeitar ao escrever o template na Meta.
// Aparece na tela de config ao lado do seletor.
export const PARAMS_FLUXO: Record<FluxoProativo, string[]> = {
  regua: ["cliente", "valor", "vencimento"],
  cobranca_manual: ["cliente", "valor", "vencimento"],
  legalizacao: ["cliente", "etapa", "processo", "data"],
  comunicado: ["cliente", "titulo"],
  followup: ["cliente", "proposta"],
  // Quatro posições: sem valor e vencimento a mensagem da NFS-e sairia sem dizer quanto nem
  // até quando. PIX/banco não entram — são fixos por escritório e cabem no corpo aprovado.
  nfse: ["cliente", "competencia", "valor", "vencimento"],
};

const JANELA_MS = 24 * 60 * 60 * 1000;

// Dentro da janela de atendimento da Meta: o cliente falou nas últimas 24h.
export function dentroDaJanela(ultimaEntradaEm: string | null, agora: string): boolean {
  if (!ultimaEntradaEm) return false;
  const t = Date.parse(ultimaEntradaEm);
  const a = Date.parse(agora);
  if (Number.isNaN(t) || Number.isNaN(a)) return false;
  return a - t < JANELA_MS;
}

export type Modo = { modo: "texto" } | { modo: "template" } | { modo: "falha"; motivo: string };

export function decidirEnvio(e: {
  politica: PoliticaFluxo;
  exigeTemplate: boolean;
  dentroDaJanela: boolean;
  temTemplate: boolean;
}): Modo {
  // Provedor que não exige template (Z-API): texto livre, como sempre foi.
  if (!e.exigeTemplate) return { modo: "texto" };
  if (e.politica === "janela" && e.dentroDaJanela) return { modo: "texto" };
  if (e.temTemplate) return { modo: "template" };
  return { modo: "falha", motivo: "Sem template aprovado configurado para este fluxo." };
}
