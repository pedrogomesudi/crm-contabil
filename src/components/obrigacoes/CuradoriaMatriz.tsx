"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import type { EstadoRevisao, ResultadoDiff } from "@/lib/obrigacoes/curadoria";
import { aplicarDoPadrao } from "@/app/(app)/configuracoes/obrigacoes/actions";

// O selo diz, na própria tela que edita a matriz, se aquela regra ainda foi conferida por
// gente. Fora daqui ele não teria utilidade: quem edita o prazo é quem precisa da dúvida.
const SELO: Record<EstadoRevisao, { texto: string; variante: "positivo" | "atencao" | "neutro" }> = {
  em_dia: { texto: "revisada", variante: "positivo" },
  vencida: { texto: "conferir", variante: "atencao" },
  nunca: { texto: "nunca revisada", variante: "neutro" },
};

export function SeloRevisao({
  estado,
  revisadaEm,
  revisadaPorNome,
}: {
  estado: EstadoRevisao;
  revisadaEm: string | null;
  revisadaPorNome: string | null;
}) {
  const s = SELO[estado];
  const quando = revisadaEm ? revisadaEm.slice(0, 10).split("-").reverse().join("/") : null;
  const titulo = quando ? `Revisada em ${quando}${revisadaPorNome ? ` por ${revisadaPorNome}` : ""}` : undefined;
  return (
    <span title={titulo}>
      <Badge variante={s.variante}>{s.texto}</Badge>
    </span>
  );
}

const ROTULO_CAMPO: Record<string, string> = {
  esfera: "esfera",
  periodicidade: "periodicidade",
  aplicavelA: "aplicável a",
  condicaoFlags: "condições",
  condicaoModo: "modo da condição",
  ufs: "UFs",
  cnaePrefixos: "CNAEs",
  vencDia: "dia do vencimento",
  vencMesOffset: "meses após a competência",
  vencMes: "mês do vencimento",
  vencAnoOffset: "anos após a competência",
  antecipa: "antecipa para dia útil",
  baseLegal: "base legal",
  vigenteDe: "vigente a partir de",
  vigenteAte: "vigente até",
};

const mostrar = (v: unknown): string => {
  if (v === null || v === undefined || v === "") return "—";
  if (Array.isArray(v)) return v.length ? v.join(", ") : "—";
  if (typeof v === "boolean") return v ? "sim" : "não";
  return String(v);
};

// O padrão do sistema mudou (correção de prazo, base legal nova) e o banco do escritório não
// reflete. Aplicar é item a item, com o valor atual à vista — em massa apagaria customização
// legítima, e é por medo disso que a correção nunca chegava a quem já tinha semeado.
export function PainelDivergencias({ diff }: { diff: ResultadoDiff }) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState("");

  if (diff.divergentes.length === 0 && diff.ausentes.length === 0) return null;

  function aplicar(codigo: string, campo: string) {
    iniciar(async () => {
      const r = await aplicarDoPadrao(codigo, campo);
      if (r.erro) setErro(r.erro);
      else router.refresh();
    });
  }

  return (
    <section className="space-y-3 rounded-2xl border border-atencao-borda bg-atencao-fundo p-4">
      <div>
        <h2 className="font-display text-base font-semibold text-texto">
          A matriz do sistema mudou em {diff.divergentes.length} ponto(s)
        </h2>
        <p className="mt-0.5 text-xs text-cinza">
          Correções do padrão (prazo, incidência, base legal) que a sua matriz ainda não tem. Só campos definidos por
          norma aparecem aqui — deixar uma obrigação inativa ou mudar a folga interna é ajuste seu e não entra.
        </p>
      </div>

      {diff.ausentes.length > 0 && (
        <p className="text-sm text-texto">
          <b>Ausentes:</b> {diff.ausentes.join(", ")} — use “Semear matriz padrão” para incluir.
        </p>
      )}

      {diff.divergentes.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-atencao-borda bg-white">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-linha text-left text-xs text-cinza">
                <th className="px-3 py-2 font-medium">Obrigação</th>
                <th className="px-3 py-2 font-medium">Campo</th>
                <th className="px-3 py-2 font-medium">Na sua matriz</th>
                <th className="px-3 py-2 font-medium">No padrão</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {diff.divergentes.map((d) => (
                <tr key={`${d.codigo}.${d.campo}`} className="border-b border-linha/60">
                  <td className="px-3 py-1.5 font-medium text-texto">{d.codigo}</td>
                  <td className="px-3 py-1.5">{ROTULO_CAMPO[d.campo] ?? d.campo}</td>
                  <td className="px-3 py-1.5 text-cinza">{mostrar(d.noBanco)}</td>
                  <td className="px-3 py-1.5 text-texto">{mostrar(d.noPadrao)}</td>
                  <td className="px-3 py-1.5 text-right">
                    <button
                      type="button"
                      disabled={pendente}
                      onClick={() => aplicar(d.codigo, d.campo)}
                      className="text-verde underline disabled:opacity-50"
                    >
                      Aplicar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {erro && <p className="text-sm text-negativo">{erro}</p>}
    </section>
  );
}
