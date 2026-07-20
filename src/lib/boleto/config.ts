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

export function prontidaoBoleto(
  c: ConfigBoletoView,
  webhookSecretDefinido: boolean,
): { rotulo: string; ok: boolean }[] {
  const { configurado } = statusConfigBoleto(c);
  return [
    { rotulo: "Provedor selecionado", ok: c.provedor !== "nenhum" },
    { rotulo: "Credenciais do provedor completas", ok: c.provedor !== "nenhum" && configurado },
    { rotulo: "Conta bancária de destino da baixa", ok: c.contaBancariaId != null },
    { rotulo: "Segredo do webhook (BOLETO_WEBHOOK_SECRET)", ok: webhookSecretDefinido },
  ];
}
