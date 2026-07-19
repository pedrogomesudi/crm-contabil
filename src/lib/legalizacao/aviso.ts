export type CfgAviso = { ativo: boolean; canal: "email" | "whatsapp" };
export type EtapaAviso = { avisarCliente: boolean; jaAvisado: boolean; concluida: boolean };

export function deveAvisar(cfg: CfgAviso, comunicarCliente: boolean, etapa: EtapaAviso): boolean {
  return cfg.ativo && comunicarCliente && etapa.avisarCliente && etapa.concluida && !etapa.jaAvisado;
}
