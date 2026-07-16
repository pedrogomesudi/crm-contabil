export type ConfigBoletoView = {
  provedor: "nenhum" | "inter" | "asaas";
  asaasAmbiente: "sandbox" | "producao";
  interContaCorrente: string | null;
  contaBancariaId: string | null;
  asaasApiKeyDefinida: boolean;
  interClientIdDefinido: boolean;
  interClientSecretDefinido: boolean;
  interCertDefinido: boolean;
  interKeyDefinida: boolean;
};

export function statusConfigBoleto(c: ConfigBoletoView): { provedor: string; configurado: boolean } {
  if (c.provedor === "asaas") return { provedor: "asaas", configurado: c.asaasApiKeyDefinida };
  if (c.provedor === "inter")
    return {
      provedor: "inter",
      configurado:
        c.interClientIdDefinido &&
        c.interClientSecretDefinido &&
        c.interCertDefinido &&
        c.interKeyDefinida &&
        !!c.interContaCorrente,
    };
  return { provedor: "nenhum", configurado: false };
}
