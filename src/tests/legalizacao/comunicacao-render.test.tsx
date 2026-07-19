import { describe, it, expect, vi } from "vitest";
vi.mock("@/app/(app)/configuracoes/legalizacao/comunicacao-actions", () => ({ salvarComunicacaoLeg: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
import { renderToStaticMarkup } from "react-dom/server";
import { FormComunicacaoLeg } from "@/app/(app)/configuracoes/legalizacao/FormComunicacaoLeg";

describe("FormComunicacaoLeg", () => {
  it("renderiza canal, ativo e a mensagem", () => {
    const html = renderToStaticMarkup(
      <FormComunicacaoLeg cfg={{ canal: "email", ativo: false, assunto: "Andamento", template: "Olá {cliente}" }} />,
    );
    expect(html).toContain("Comunicação automática");
    expect(html).toContain("Canal");
    expect(html).toContain("Ativo");
    expect(html).toContain("{cliente}"); // legenda das variáveis
  });
});
