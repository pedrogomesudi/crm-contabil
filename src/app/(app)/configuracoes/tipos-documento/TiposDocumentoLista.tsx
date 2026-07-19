"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Botao } from "@/components/ui/Botao";
import { controleCls } from "@/components/ui/Campo";
import { DEPARTAMENTOS, rotuloDepartamento, type Departamento } from "@/lib/clientes/departamentos";
import {
  criarTipoDoc,
  moverTipoDoc,
  alternarAtivoTipoDoc,
  removerTipoDoc,
  type TipoDocRow,
} from "@/app/(app)/configuracoes/tipos-documento/actions";

export function TiposDocumentoLista({ tipos }: { tipos: TipoDocRow[] }) {
  const router = useRouter();
  const [pend, start] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  const run = (fn: () => Promise<{ erro?: string }>) =>
    start(async () => {
      const r = await fn();
      setErro(r.erro ?? null);
      if (!r.erro) router.refresh();
    });

  return (
    <div className="space-y-4">
      <ul className="space-y-2">
        {tipos.map((t) => (
          <li
            key={t.id}
            className="flex flex-wrap items-center gap-2 rounded-lg border border-linha bg-white p-3 text-sm"
          >
            <span className={t.ativo ? "text-grafite" : "text-cinza line-through"}>{t.nome}</span>
            {t.departamento && <span className="text-cinza">{rotuloDepartamento(t.departamento as Departamento)}</span>}
            <span className="ml-auto flex items-center gap-2">
              <button type="button" disabled={pend} onClick={() => run(() => moverTipoDoc(t.id, "cima"))} aria-label="Subir">
                ↑
              </button>
              <button type="button" disabled={pend} onClick={() => run(() => moverTipoDoc(t.id, "baixo"))} aria-label="Descer">
                ↓
              </button>
              <button
                type="button"
                disabled={pend}
                onClick={() => run(() => alternarAtivoTipoDoc(t.id, !t.ativo))}
                className="underline"
              >
                {t.ativo ? "desativar" : "ativar"}
              </button>
              <button
                type="button"
                disabled={pend}
                onClick={() => run(() => removerTipoDoc(t.id))}
                className="text-negativo underline"
              >
                remover
              </button>
            </span>
          </li>
        ))}
        {tipos.length === 0 && <li className="text-sm text-cinza">Nenhum tipo cadastrado ainda.</li>}
      </ul>

      <form
        action={(fd) => run(() => criarTipoDoc(fd))}
        className="flex flex-wrap items-end gap-2 rounded-lg border border-linha bg-white p-3"
      >
        <input name="nome" placeholder="nome do tipo" className={controleCls("compacto")} />
        <select name="departamento" defaultValue="" className={controleCls("compacto")}>
          <option value="">departamento (opcional)</option>
          {DEPARTAMENTOS.map((d) => (
            <option key={d.valor} value={d.valor}>
              {d.rotulo}
            </option>
          ))}
        </select>
        <Botao type="submit" variante="secundario" disabled={pend}>
          Adicionar tipo
        </Botao>
      </form>

      {erro && (
        <p role="alert" className="text-sm text-negativo">
          {erro}
        </p>
      )}
    </div>
  );
}
