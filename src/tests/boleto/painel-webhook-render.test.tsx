import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));

import { PainelProntidao } from "@/app/(app)/configuracoes/boletos/PainelProntidao";
import type { ConfigBoletoView } from "@/lib/boleto/config";

const cfg: ConfigBoletoView = {
  provedor: "inter",
  asaasAmbiente: "producao",
  interContaCorrente: "123",
  contaBancariaId: "c1",
  asaasApiKeyDefinida: false,
  interClientIdDefinido: true,
  interClientSecretDefinido: true,
  interCertDefinido: true,
  interKeyDefinida: true,
};

describe("PainelProntidao — webhook", () => {
  it("ausente => aviso de não cadastrado + botão", () => {
    const html = renderToStaticMarkup(
      <PainelProntidao config={cfg} webhookSecretDefinido appUrl="https://app.seusaldo.ai" statusWebhook="ausente" />,
    );
    expect(html).toContain("não cadastrado");
    expect(html).toContain("Cadastrar webhook no Inter");
  });
  it("ok => confirma cadastrado", () => {
    const html = renderToStaticMarkup(
      <PainelProntidao config={cfg} webhookSecretDefinido appUrl="https://app.seusaldo.ai" statusWebhook="ok" />,
    );
    expect(html).toContain("cadastrado no Inter");
  });
});
