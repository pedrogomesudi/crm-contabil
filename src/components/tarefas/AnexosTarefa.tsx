"use client";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Botao } from "@/components/ui/Botao";
import { controleCls } from "@/components/ui/Campo";
import type { EstadoUpload } from "@/app/(app)/documentos/estados";
import { anexarTarefaArquivo, linkDownloadAnexo, excluirAnexo } from "@/app/(app)/tarefas/[id]/anexo-actions";

type Anexo = { id: string; nome: string; enviado_em: string };

export function AnexosTarefa({
  tarefaId,
  podeEditar,
  anexos,
}: {
  tarefaId: string;
  podeEditar: boolean;
  anexos: Anexo[];
}) {
  const router = useRouter();
  const [estado, formAction, pending] = useActionState<EstadoUpload, FormData>(
    anexarTarefaArquivo.bind(null, tarefaId),
    {},
  );
  const formRef = useRef<HTMLFormElement>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [busy, start] = useTransition();

  useEffect(() => {
    if (estado.ok) {
      formRef.current?.reset();
      router.refresh();
    }
  }, [estado.ok, router]);

  async function baixar(id: string) {
    const r = await linkDownloadAnexo(id);
    if (r.url) window.open(r.url, "_blank", "noopener");
    else setErro(r.erro ?? "Falha ao baixar.");
  }

  function remover(id: string) {
    start(async () => {
      const r = await excluirAnexo(id, tarefaId);
      if (r.erro) setErro(r.erro);
      else router.refresh();
    });
  }

  return (
    <section className="space-y-3 rounded-lg border border-linha bg-white p-4">
      <h3 className="text-sm font-semibold text-grafite">Anexos</h3>
      <ul className="space-y-1 text-sm">
        {anexos.map((a) => (
          <li key={a.id} className="flex flex-wrap items-center gap-2">
            <button type="button" className="underline" onClick={() => baixar(a.id)}>
              {a.nome}
            </button>
            {podeEditar && (
              <button
                type="button"
                className="text-negativo underline"
                disabled={busy}
                onClick={() => remover(a.id)}
              >
                remover
              </button>
            )}
          </li>
        ))}
        {anexos.length === 0 && <li className="text-cinza">Nenhum anexo.</li>}
      </ul>

      {podeEditar && (
        <form ref={formRef} action={formAction} className="flex flex-wrap items-center gap-2">
          <input
            name="arquivo"
            type="file"
            required
            accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
            className={controleCls("compacto")}
          />
          <Botao type="submit" variante="secundario" disabled={pending}>
            {pending ? "Enviando..." : "Anexar"}
          </Botao>
        </form>
      )}

      {(estado.erro || erro) && (
        <p role="alert" className="text-sm text-negativo">
          {estado.erro ?? erro}
        </p>
      )}
    </section>
  );
}
