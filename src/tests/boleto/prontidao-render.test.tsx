import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PainelProntidao } from "@/app/(app)/configuracoes/boletos/PainelProntidao";
import type { ConfigBoletoView } from "@/lib/boleto/config";

const cfg: ConfigBoletoView = {
  provedor: "inter",
  asaasAmbiente: "producao",
  interContaCorrente: "123456",
  contaBancariaId: null,
  asaasApiKeyDefinida: false,
  interClientIdDefinido: true,
  interClientSecretDefinido: true,
  interCertDefinido: true,
  interKeyDefinida: true,
};

describe("PainelProntidao", () => {
  it("mostra ✗ para o que falta (conta destino e webhook)", () => {
    const html = renderToStaticMarkup(
      <PainelProntidao config={cfg} webhookSecretDefinido={false} appUrl="https://app.seusaldo.ai" />,
    );
    expect(html).toContain("Conta bancária de destino da baixa");
    expect(html).toContain("✗");
  });
  it("mostra a URL do webhook como template, sem o valor do segredo", () => {
    const html = renderToStaticMarkup(
      <PainelProntidao config={cfg} webhookSecretDefinido={true} appUrl="https://app.seusaldo.ai" />,
    );
    expect(html).toContain("/api/webhooks/boleto/");
    expect(html).toContain("BOLETO_WEBHOOK_SECRET"); // template, não o valor
  });
});
