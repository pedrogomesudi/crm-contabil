"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Botao } from "@/components/ui/Botao";
import { controleCls } from "@/components/ui/Campo";
import type { EmpresaRelacionada, VinculoTipo } from "@/lib/clientes/vinculos";
import { definirGrupo, criarGrupo, definirMatriz } from "@/app/(app)/clientes/[id]/vinculos-actions";

const ROTULO: Record<VinculoTipo, string> = {
  grupo: "mesmo grupo",
  matriz: "matriz",
  filial: "filial",
  socio: "mesmo sócio",
};

type VinculosProps = {
  clienteId: string;
  podeEditar: boolean;
  grupo: { id: string; nome: string } | null;
  gruposDisponiveis: { id: string; nome: string }[];
  matriz: { id: string; razao_social: string } | null;
  filiais: { id: string; razao_social: string }[];
  candidatosMatriz: { id: string; razao_social: string }[];
  relacionadas: EmpresaRelacionada[];
};

export function VinculosSection(props: VinculosProps) {
  const router = useRouter();
  const [pend, start] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [novoGrupo, setNovoGrupo] = useState("");

  const run = (fn: () => Promise<{ erro?: string }>) =>
    start(async () => {
      const r = await fn();
      setErro(r.erro ?? null);
      if (!r.erro) router.refresh();
    });

  return (
    <section className="space-y-4 rounded-lg border border-linha bg-white p-4">
      <h3 className="text-sm font-semibold text-grafite">Vínculos</h3>

      {/* Grupo econômico */}
      <div className="space-y-2">
        <p className="text-sm text-cinza">
          Grupo econômico: <span className="text-grafite">{props.grupo?.nome ?? "sem grupo"}</span>
        </p>
        {props.podeEditar && (
          <div className="flex flex-wrap items-center gap-2">
            <select
              className={controleCls("compacto")}
              value={props.grupo?.id ?? ""}
              disabled={pend}
              onChange={(e) => run(() => definirGrupo(props.clienteId, e.target.value || null))}
            >
              <option value="">sem grupo</option>
              {props.gruposDisponiveis.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.nome}
                </option>
              ))}
            </select>
            <input
              className={controleCls("compacto")}
              placeholder="novo grupo"
              value={novoGrupo}
              disabled={pend}
              onChange={(e) => setNovoGrupo(e.target.value)}
            />
            <Botao
              type="button"
              variante="secundario"
              disabled={pend || !novoGrupo.trim()}
              onClick={() =>
                run(async () => {
                  const r = await criarGrupo(props.clienteId, novoGrupo);
                  if (!r.erro) setNovoGrupo("");
                  return r;
                })
              }
            >
              Criar e vincular
            </Botao>
          </div>
        )}
      </div>

      {/* Matriz / filial */}
      <div className="space-y-2">
        {props.matriz ? (
          <p className="text-sm text-cinza">
            Filial de{" "}
            <Link href={`/clientes/${props.matriz.id}`} className="underline">
              {props.matriz.razao_social}
            </Link>
          </p>
        ) : (
          <p className="text-sm text-cinza">Matriz{props.filiais.length > 0 ? " de:" : " (sem filiais)"}</p>
        )}
        {props.filiais.length > 0 && (
          <ul className="text-sm">
            {props.filiais.map((f) => (
              <li key={f.id}>
                <Link href={`/clientes/${f.id}`} className="underline">
                  {f.razao_social}
                </Link>
              </li>
            ))}
          </ul>
        )}
        {props.podeEditar && !props.matriz && (
          <select
            className={controleCls("compacto")}
            value=""
            disabled={pend}
            onChange={(e) => run(() => definirMatriz(props.clienteId, e.target.value || null))}
          >
            <option value="">definir matriz…</option>
            {props.candidatosMatriz.map((c) => (
              <option key={c.id} value={c.id}>
                {c.razao_social}
              </option>
            ))}
          </select>
        )}
        {props.podeEditar && props.matriz && (
          <Botao
            type="button"
            variante="secundario"
            disabled={pend}
            onClick={() => run(() => definirMatriz(props.clienteId, null))}
          >
            Desvincular da matriz
          </Botao>
        )}
      </div>

      {/* Empresas relacionadas */}
      {props.relacionadas.length > 0 && (
        <div className="space-y-1">
          <p className="text-sm font-medium text-grafite">Empresas relacionadas</p>
          <ul className="text-sm">
            {props.relacionadas.map((r) => (
              <li key={r.clienteId}>
                <Link href={`/clientes/${r.clienteId}`} className="underline">
                  {r.nome}
                </Link>{" "}
                <span className="text-cinza">({r.tipos.map((t) => ROTULO[t]).join(", ")})</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {erro && (
        <p role="alert" className="text-sm text-negativo">
          {erro}
        </p>
      )}
    </section>
  );
}
