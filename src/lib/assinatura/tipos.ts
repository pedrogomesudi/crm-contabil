export type PapelSignatario = "contratada" | "contratante" | "testemunha";
export type SignatarioInput = { nome: string; email: string; papel: PapelSignatario };
export type SignatarioEnviado = SignatarioInput & { clicksignKey: string };
export type ResultadoEnvio = {
  envelopeId: string;
  documentId: string;
  signatarios: SignatarioEnviado[];
};
export type EventoAssinatura =
  | { tipo: "assinou"; envelopeId: string; email: string }
  | { tipo: "recusou"; envelopeId: string; email: string }
  | { tipo: "finalizou"; envelopeId: string }
  | { tipo: "ignorar" };
