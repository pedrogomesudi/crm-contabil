import { describe, it, expect, vi } from "vitest";
vi.mock("@/app/(app)/configuracoes/boletos/actions", () => ({ salvarConfigBoleto: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
import { renderToStaticMarkup } from "react-dom/server";
import { FormBoletos } from "@/app/(app)/configuracoes/boletos/FormBoletos";
import type { ConfigBoletoView } from "@/lib/boleto/config";

const base: ConfigBoletoView = { provedor: "asaas", asaasAmbiente: "producao", interContaCorrente: null, contaBancariaId: null, asaasApiKeyDefinida: true, interClientIdDefinido: false, interClientSecretDefinido: false, interCertDefinido: false, interKeyDefinida: false };

describe("FormBoletos", () => {
  it("mostra seletor e campos do provedor ativo (asaas)", () => {
    const html = renderToStaticMarkup(<FormBoletos config={base} contas={[{ id: "cb1", nome: "Inter PJ" }]} />);
    expect(html).toContain("Provedor");
    expect(html).toContain("API key");
  });
  it("inter mostra certificado", () => {
    const html = renderToStaticMarkup(<FormBoletos config={{ ...base, provedor: "inter", asaasApiKeyDefinida: false }} contas={[{ id: "cb1", nome: "Inter PJ" }]} />);
    expect(html).toContain("Certificado");
  });
});
