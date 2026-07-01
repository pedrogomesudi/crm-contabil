export type PapelSignatario = "contratada" | "contratante" | "testemunha";
export type SignatarioInput = { nome: string; email: string; papel: PapelSignatario };
export type SignatarioEnviado = SignatarioInput & { clicksignKey: string };
export type ResultadoEnvio = {
  envelopeId: string;
  documentId: string;
  signatarios: SignatarioEnviado[];
};
// O webhook (formato legado da Clicksign) referencia o documento por `document.key`
// (== nosso clicksign_document_id), não o envelope.
export type EventoAssinatura =
  | { tipo: "assinou"; documentKey: string; email: string }
  | { tipo: "recusou"; documentKey: string; email: string }
  | { tipo: "finalizou"; documentKey: string }
  | { tipo: "ignorar" };
