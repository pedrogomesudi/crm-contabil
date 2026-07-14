"use client";
import Link from "next/link";
import type { TarefaView } from "./actions";
import { DIAS_SEMANA_CURTO, NOMES_MES, gradeDoMes, mesAnterior, mesSeguinte } from "@/lib/tarefas/calendario";

const PRIO_PONTO: Record<string, string> = {
  urgente: "bg-negativo",
  alta: "bg-amber-500",
  media: "bg-cinza-claro",
  baixa: "bg-cinza-claro",
};

export function Calendario({
  tarefas,
  ano,
  mes,
  hoje,
  link,
}: {
  tarefas: TarefaView[];
  ano: number;
  mes: number;
  hoje: string;
  link: (extra: Record<string, string | undefined>) => string;
}) {
  const grade = gradeDoMes(ano, mes);

  const porDia = new Map<string, TarefaView[]>();
  const semPrazo: TarefaView[] = [];
  for (const t of tarefas) {
    if (!t.prazo) {
      semPrazo.push(t);
      continue;
    }
    const lista = porDia.get(t.prazo) ?? [];
    lista.push(t);
    porDia.set(t.prazo, lista);
  }

  const ant = mesAnterior(ano, mes);
  const seg = mesSeguinte(ano, mes);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-sm font-semibold text-texto">
          {NOMES_MES[mes - 1]} de {ano}
        </h2>
        <span className="flex gap-1 text-xs">
          <Link href={link({ ano: String(ant.ano), mes: String(ant.mes) })} className="rounded-lg border border-linha px-2 py-1 text-cinza">
            ← anterior
          </Link>
          <Link href={link({ ano: undefined, mes: undefined })} className="rounded-lg border border-linha px-2 py-1 text-cinza">
            hoje
          </Link>
          <Link href={link({ ano: String(seg.ano), mes: String(seg.mes) })} className="rounded-lg border border-linha px-2 py-1 text-cinza">
            próximo →
          </Link>
        </span>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[42rem] rounded-2xl border border-linha bg-white">
          <div className="grid grid-cols-7 border-b border-linha text-xs text-cinza">
            {DIAS_SEMANA_CURTO.map((d) => (
              <div key={d} className="px-2 py-1.5 text-center font-medium">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {grade.map((c) => {
              const doDia = porDia.get(c.data) ?? [];
              const ehHoje = c.data === hoje;
              return (
                <div
                  key={c.data}
                  className={`min-h-24 border-b border-r border-linha/60 p-1.5 ${c.doMes ? "" : "bg-creme/50"}`}
                >
                  <div className={`mb-1 text-xs ${ehHoje ? "font-bold text-verde" : c.doMes ? "text-texto" : "text-cinza-claro"}`}>
                    {Number(c.data.slice(8, 10))}
                  </div>
                  <ul className="space-y-0.5">
                    {doDia.slice(0, 3).map((t) => {
                      const vencida = t.status !== "concluida" && t.prazo !== null && t.prazo < hoje;
                      return (
                        <li key={t.id} className="truncate text-xs">
                          <Link
                            href={`/tarefas/${t.id}`}
                            className={`flex items-center gap-1 ${vencida ? "text-negativo" : "text-texto"} hover:underline`}
                            title={t.titulo}
                          >
                            <span className={`inline-block size-1.5 shrink-0 rounded-full ${PRIO_PONTO[t.prioridade]}`} />
                            <span className={`truncate ${t.status === "concluida" ? "line-through opacity-60" : ""}`}>{t.titulo}</span>
                          </Link>
                        </li>
                      );
                    })}
                    {doDia.length > 3 && (
                      <li className="text-xs text-cinza">+{doDia.length - 3} mais</li>
                    )}
                  </ul>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Tarefa sem prazo não pode sumir da vista — some do calendário, some da cabeça de alguém. */}
      <div className="rounded-2xl border border-linha bg-white p-3">
        <h3 className="text-xs font-medium text-cinza">Sem prazo ({semPrazo.length})</h3>
        {semPrazo.length === 0 ? (
          <p className="mt-1 text-xs text-cinza-claro">Nenhuma.</p>
        ) : (
          <ul className="mt-1 flex flex-wrap gap-2">
            {semPrazo.map((t) => (
              <li key={t.id}>
                <Link href={`/tarefas/${t.id}`} className="rounded-lg border border-linha px-2 py-1 text-xs text-texto hover:bg-creme">
                  {t.titulo}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
