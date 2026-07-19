import { describe, it, expect, vi } from "vitest";
vi.mock("@/app/(app)/tarefas/[id]/anexo-actions", () => ({
  anexarTarefaArquivo: vi.fn(),
  linkDownloadAnexo: vi.fn(),
  excluirAnexo: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
import { renderToStaticMarkup } from "react-dom/server";
import { AnexosTarefa } from "@/components/tarefas/AnexosTarefa";

describe("AnexosTarefa", () => {
  it("lista os anexos e mostra o upload quando pode editar", () => {
    const html = renderToStaticMarkup(
      <AnexosTarefa
        tarefaId="t1"
        podeEditar
        anexos={[{ id: "a1", nome: "contrato.pdf", enviado_em: "2026-07-19T00:00:00Z" }]}
      />,
    );
    expect(html).toContain("Anexos");
    expect(html).toContain("contrato.pdf");
    expect(html).toContain('type="file"');
  });

  it("sem permissão, não mostra o upload", () => {
    const html = renderToStaticMarkup(<AnexosTarefa tarefaId="t1" podeEditar={false} anexos={[]} />);
    expect(html).not.toContain('type="file"');
  });
});
