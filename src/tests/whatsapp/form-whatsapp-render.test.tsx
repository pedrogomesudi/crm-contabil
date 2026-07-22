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
      />,
    );
    expect(html).toContain("Z-API");
    expect(html).toContain("API oficial");
    expect(html).toContain("Instance ID");
  });
});
