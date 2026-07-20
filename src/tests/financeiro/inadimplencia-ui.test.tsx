import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { LinhaCliente } from "@/app/(app)/financeiro/inadimplencia/LinhaCliente";

const item = { clienteId: "c1", cliente: "Padaria X", saldoDevedor: 500, diasAtraso: 40, suspenso: false };
const noop = async () => ({ ok: true });

describe("LinhaCliente", () => {
  it("mostra o cliente, o saldo e o rótulo da ação", () => {
    const html = renderToStaticMarkup(<LinhaCliente item={item} acaoLabel="Suspender" onAcao={noop} />);
    expect(html).toContain("Padaria X");
    expect(html).toContain("Suspender");
    expect(html).toContain("40d");
  });
  it("o rótulo da ação é configurável (reativar)", () => {
    const html = renderToStaticMarkup(
      <LinhaCliente item={{ ...item, suspenso: true }} acaoLabel="Reativar" onAcao={noop} />,
    );
    expect(html).toContain("Reativar");
  });
});
