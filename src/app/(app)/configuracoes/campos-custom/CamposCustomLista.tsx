"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Botao } from "@/components/ui/Botao";
import { controleCls } from "@/components/ui/Campo";
import {
  criarCampo,
  moverCampo,
  alternarAtivo,
  removerCampo,
  type CampoRow,
} from "@/app/(app)/configuracoes/campos-custom/actions";

const TIPO_ROTULO: Record<string, string> = {
  texto: "Texto",
  numero: "Número",
  data: "Data",
  booleano: "Sim/Não",
  lista: "Lista",
};

export function CamposCustomLista({ campos }: { campos: CampoRow[] }) {
  const router = useRouter();
  const [pend, start] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [tipo, setTipo] = useState("texto");

  const run = (fn: () => Promise<{ erro?: string }>) =>
    start(async () => {
      const r = await fn();
      setErro(r.erro ?? null);
      if (!r.erro) router.refresh();
    });

  return (
    <div className="space-y-4">
      <ul className="space-y-2">
        {campos.map((c) => (
          <li
            key={c.id}
            className="flex flex-wrap items-center gap-2 rounded-lg border border-linha bg-white p-3 text-sm"
          >
            <span className={c.ativo ? "text-grafite" : "text-cinza line-through"}>{c.nome}</span>
            <span className="text-cinza">{TIPO_ROTULO[c.tipo]}</span>
            {c.obrigatorio && <span className="text-cinza">obrigatório</span>}
            {c.tipo === "lista" && <span className="text-cinza">[{c.opcoes.join(", ")}]</span>}
            <span className="ml-auto flex items-center gap-2">
              <button type="button" disabled={pend} onClick={() => run(() => moverCampo(c.id, "cima"))} aria-label="Subir">
                ↑
              </button>
              <button
                type="button"
                disabled={pend}
                onClick={() => run(() => moverCampo(c.id, "baixo"))}
                aria-label="Descer"
              >
                ↓
              </button>
              <button
                type="button"
                disabled={pend}
                onClick={() => run(() => alternarAtivo(c.id, !c.ativo))}
                className="underline"
              >
                {c.ativo ? "desativar" : "ativar"}
              </button>
              <button
                type="button"
                disabled={pend}
                onClick={() => run(() => removerCampo(c.id))}
                className="text-negativo underline"
              >
                remover
              </button>
            </span>
          </li>
        ))}
        {campos.length === 0 && <li className="text-sm text-cinza">Nenhum campo customizado ainda.</li>}
      </ul>

      <form
        action={(fd) => run(() => criarCampo(fd))}
        className="flex flex-wrap items-end gap-2 rounded-lg border border-linha bg-white p-3"
      >
        <input name="nome" placeholder="nome do campo" className={controleCls("compacto")} />
        <select
          name="tipo"
          value={tipo}
          onChange={(e) => setTipo(e.target.value)}
          className={controleCls("compacto")}
        >
          {Object.entries(TIPO_ROTULO).map(([v, r]) => (
            <option key={v} value={v}>
              {r}
            </option>
          ))}
        </select>
        {tipo === "lista" && (
          <input name="opcoes" placeholder="opções (vírgula)" className={controleCls("compacto")} />
        )}
        <label className="flex items-center gap-1 text-sm text-cinza">
          <input type="checkbox" name="obrigatorio" /> obrigatório
        </label>
        <Botao type="submit" variante="secundario" disabled={pend}>
          Adicionar campo
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
