"use client";
import { useState, useTransition } from "react";
import { aplicarImportacao } from "@/app/(app)/integracoes/dominio/actions";
import type { ItemPrevia, ResumoPrevia } from "@/app/(app)/integracoes/dominio/estados";

const LABEL_CAMPO: Record<string, string> = {
  razao_social: "Razão social",
  regime_tributario: "Regime",
  status: "Status",
  email: "E-mail",
  telefone: "Telefone",
};

function Card({ rotulo, n, cor }: { rotulo: string; n: number; cor: string }) {
  return (
    <div className={`rounded-md border p-3 text-center ${cor}`}>
      <div className="text-2xl font-semibold">{n}</div>
      <div className="text-xs">{rotulo}</div>
    </div>
  );
}

function fmt(v: unknown): string {
  return v === null || v === undefined || v === "" ? "—" : String(v);
}

function Secao({ titulo, itens, render }: { titulo: string; itens: ItemPrevia[]; render: (i: ItemPrevia) => React.ReactNode }) {
  if (itens.length === 0) return null;
  return (
    <details className="rounded-md border border-gray-200">
      <summary className="cursor-pointer px-3 py-2 text-sm font-medium">
        {titulo} ({itens.length})
      </summary>
      <ul className="max-h-72 divide-y divide-gray-100 overflow-auto border-t border-gray-100 text-sm">
        {itens.map((i) => (
          <li key={i.cpf_cnpj} className="px-3 py-2">
            {render(i)}
          </li>
        ))}
      </ul>
    </details>
  );
}

export function PreviaImportacao({ resumo }: { resumo: ResumoPrevia }) {
  const [pend, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [feito, setFeito] = useState(false);

  const aplicar = () =>
    start(async () => {
      const r = await aplicarImportacao(resumo.importacaoId);
      if (r.erro) setMsg(r.erro);
      else {
        setFeito(true);
        const hon = r.honorarios ? ` · ${r.honorarios} honorário(s) atualizado(s)` : "";
        setMsg(`Importação aplicada: ${r.gravados} cliente(s) novo(s) criado(s)${hon}.`);
      }
    });

  const novos = resumo.itens.filter((i) => i.classe === "novo");
  const atualizados = resumo.itens.filter((i) => i.classe === "atualizado");
  const pendencias = resumo.itens.filter((i) => i.classe === "pendencia");

  return (
    <div className="space-y-3 rounded-lg border border-gray-200 p-4">
      <h2 className="text-sm font-semibold">Prévia da importação</h2>
      {resumo.avisos?.map((a, i) => (
        <p
          key={i}
          role="alert"
          className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800"
        >
          ⚠️ {a}
        </p>
      ))}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Card rotulo="Novos" n={resumo.novos} cor="border-green-200 bg-green-50" />
        <Card rotulo="Atualizados" n={resumo.atualizados} cor="border-yellow-200 bg-yellow-50" />
        <Card rotulo="Inalterados" n={resumo.inalterados} cor="border-gray-200 bg-gray-50" />
        <Card rotulo="Pendências" n={resumo.pendencias} cor="border-purple-200 bg-purple-50" />
      </div>

      <p className="rounded border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800">
        ℹ️ Clientes já cadastrados <strong>não têm o cadastro alterado</strong> pela importação — só o{" "}
        <strong>honorário</strong> pode ser trazido/atualizado pelos contratos (e nunca é zerado). Apenas os{" "}
        <strong>Novos</strong> são criados.
      </p>

      <div className="space-y-2">
        <Secao
          titulo="🟣 Pendências (não serão gravadas)"
          itens={pendencias}
          render={(i) => (
            <>
              <span className="font-medium">{i.razao_social || i.cpf_cnpj}</span>
              <span className="block text-xs text-gray-600">{i.pendencias.join("; ")}</span>
            </>
          )}
        />
        <Secao
          titulo="🟡 Já cadastrados — Domínio tem dados diferentes (cadastro NÃO será alterado)"
          itens={atualizados}
          render={(i) => (
            <>
              <span className="font-medium">{i.razao_social}</span>
              <span className="block text-xs text-gray-600">
                {Object.entries(i.diff)
                  .map(([campo, [antigo, novo]]) => `${LABEL_CAMPO[campo] ?? campo}: mantém "${fmt(antigo)}" (Domínio traz "${fmt(novo)}")`)
                  .join(" · ")}
              </span>
            </>
          )}
        />
        <Secao
          titulo="🟢 Novos"
          itens={novos}
          render={(i) => (
            <>
              <span className="font-medium">{i.razao_social}</span>
              <span className="block text-xs text-gray-600">
                CNPJ/CPF {i.cpf_cnpj}
                {i.regime ? ` · ${i.regime}` : ""}
              </span>
            </>
          )}
        />
      </div>

      {!feito && (
        <button
          onClick={aplicar}
          disabled={pend}
          className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {pend ? "Aplicando…" : `Aplicar (${resumo.novos} novo(s) + honorários)`}
        </button>
      )}
      {msg && (
        <p role="status" className="text-sm">
          {msg}
        </p>
      )}
    </div>
  );
}
