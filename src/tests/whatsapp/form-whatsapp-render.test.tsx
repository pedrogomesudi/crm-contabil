import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { FormWhatsapp } from "@/app/(app)/configuracoes/whatsapp/Formularios";

describe("FormWhatsapp", () => {
  it("mostra o seletor de provedor com as duas opções", () => {
    const html = renderToStaticMarkup(
      <FormWhatsapp
        provedor="zapi"
        instance=""
        zapiConfigurado={false}
        oficialPhoneNumberId=""
        oficialConfigurado={false}
        oficialAppSecretConfigurado={false}
        oficialVerifyToken="" oficialWabaId=""
      />,
    );
    expect(html).toContain("Z-API");
    expect(html).toContain("API oficial");
    expect(html).toContain("Instance ID");
  });

  it("bloco oficial mostra Verify Token, App Secret e a URL do webhook", () => {
    const html = renderToStaticMarkup(
      <FormWhatsapp
        provedor="oficial"
        instance=""
        zapiConfigurado={false}
        oficialPhoneNumberId=""
        oficialConfigurado={false}
        oficialAppSecretConfigurado={false}
        oficialVerifyToken="" oficialWabaId=""
      />,
    );
    expect(html).toContain("Verify Token");
    expect(html).toContain("App Secret");
    expect(html).toContain("/api/webhooks/whatsapp-oficial");
  });
});
