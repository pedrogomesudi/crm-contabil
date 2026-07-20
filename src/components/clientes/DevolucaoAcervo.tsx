"use client";
import { useState, useTransition } from "react";
import { Botao } from "@/components/ui/Botao";
import { gerarPacoteDevolucao } from "@/app/(app)/clientes/[id]/acervo-actions";

export function DevolucaoAcervo({ clienteId }: { clienteId: string }) {
  const [pend, start] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  function gerar() {
    setErro(null);
    start(async () => {
      const r = await gerarPacoteDevolucao(clienteId);
      if (r.erro || !r.zipBase64 || !r.nome) {
        setErro(r.erro ?? "Falha ao gerar o pacote.");
        return;
      }
      const bytes = Uint8Array.from(atob(r.zipBase64), (c) => c.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: "application/zip" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = r.nome;
      a.click();
      URL.revokeObjectURL(url);
    });
  }

  return (
    <section className="space-y-2 rounded-lg border border-linha bg-white p-4">
      <h3 className="text-sm font-semibold text-grafite">Devolução de acervo</h3>
      <p className="text-xs text-cinza">
        Gera um pacote (ZIP) com o Termo de acervo (NBC PG 01) e os documentos do cliente, para a entrega na
        rescisão do contrato.
      </p>
      <Botao type="button" variante="secundario" disabled={pend} onClick={gerar}>
        {pend ? "Gerando..." : "Gerar pacote de devolução (rescisão)"}
      </Botao>
      {erro && (
        <p role="alert" className="text-sm text-negativo">
          {erro}
        </p>
      )}
    </section>
  );
}
