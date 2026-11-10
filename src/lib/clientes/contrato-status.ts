// Situação do contrato de honorários de um cliente, para a coluna da lista.
//
// Duas origens, de propósito: o envelope do ClickSign (que o sistema rastreia sozinho) e o
// documento do tipo "Contrato assinado" anexado à mão — muitos contratos são assinados em
// papel, e sem essa segunda via eles apareceriam eternamente como "não enviado".
export type EstadoContrato = "assinado" | "assinado_cliente" | "enviado" | "recusado" | "nenhum";

export const LABEL_CONTRATO: Record<EstadoContrato, string> = {
  assinado: "Assinado",
  assinado_cliente: "Assinado pelo cliente",
  enviado: "Enviado",
  recusado: "Recusado",
  nenhum: "—",
};

// Precedência, da mais forte para a mais fraca:
//   assinado > assinado_cliente > enviado > recusado > nenhum
// "enviado" vence "recusado" porque um reenvio depois de recusa é tentativa em andamento, e é
// isso que interessa a quem olha a lista. "cancelado" não é pendência nem recusa — volta a nada.
//
// `assinado_cliente` (envelope `parcial`) é estado próprio, e não um "enviado" qualquer: o
// cliente já fez a parte dele e a bola está com a contratada. Enquanto os dois eram a mesma
// coisa na tela, 18 contratos ficaram parados sem ninguém saber que esperavam só a Elevare.
export function estadoContratoCliente(
  assinaturas: { status: string }[],
  temDocumentoAssinado: boolean,
): EstadoContrato {
  if (temDocumentoAssinado) return "assinado";
  const status = new Set(assinaturas.map((a) => a.status));
  if (status.has("finalizado")) return "assinado";
  if (status.has("parcial")) return "assinado_cliente";
  if (status.has("enviado")) return "enviado";
  if (status.has("recusado")) return "recusado";
  return "nenhum";
}
