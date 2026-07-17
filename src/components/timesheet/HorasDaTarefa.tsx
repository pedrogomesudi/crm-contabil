"use client";
import { controleCls } from "@/components/ui/Campo";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatarHoras, parseDuracao } from "@/lib/timesheet/apontamento";
import { iniciarCronometro, pararCronometro, salvarApontamento } from "@/app/(app)/timesheet/actions";

export function HorasDaTarefa({
  tarefaId,
  minutosTotal,
  sessaoNesta,
  minutosSessao,
  hoje,
}: {
  tarefaId: string;
  minutosTotal: number;
  sessaoNesta: boolean;
  minutosSessao: number;
  hoje: string;
}) {
  const router = useRouter();
  const [duracao, setDuracao] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function iniciar() {
    setOcupado(true);
    setErro(null);
    const r = await iniciarCronometro({ tarefaId });
    setOcupado(false);
    if (r.erro) return setErro(r.erro);
    router.refresh();
  }

  async function parar() {
    setOcupado(true);
    setErro(null);
    const r = await pararCronometro();
    setOcupado(false);
    if (r.erro) return setErro(r.erro);
    // Sessão longa precisa de confirmação — o painel do timesheet trata isso.
    if (r.confirmar) {
      setErro("Sessão longa: confirme o tempo no Timesheet antes de gravar.");
      return;
    }
    router.refresh();
  }

  async function apontar() {
    const minutos = parseDuracao(duracao);
    if (minutos === null) return setErro("Duração inválida (use 1h30, 1:30 ou 90).");
    setOcupado(true);
    setErro(null);
    const r = await salvarApontamento({ data: hoje, minutos, clienteId: null, tarefaId, descricao: null });
    setOcupado(false);
    if (r.erro) return setErro(r.erro);
    setDuracao("");
    router.refresh();
  }

  return (
    <section className="space-y-2 rounded-2xl border border-linha bg-white p-4 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-sm font-semibold text-texto">
          Horas <span className="font-normal text-cinza">· {formatarHoras(minutosTotal)} apontadas nesta tarefa</span>
        </h2>
        <Link href="/timesheet" className="text-xs text-verde underline">
          Timesheet
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {sessaoNesta ? (
          <>
            <span className="text-cinza">Cronômetro rodando há {formatarHoras(minutosSessao)}</span>
            <button
              onClick={parar}
              disabled={ocupado}
              className="rounded-lg bg-verde px-3 py-1.5 text-white disabled:opacity-60"
            >
              Parar e apontar
            </button>
          </>
        ) : (
          <button
            onClick={iniciar}
            disabled={ocupado}
            className="rounded-lg border border-linha px-3 py-1.5 text-cinza disabled:opacity-60"
          >
            Iniciar cronômetro
          </button>
        )}
        <span className="text-cinza-claro">ou</span>
        <input
          value={duracao}
          onChange={(e) => setDuracao(e.target.value)}
          placeholder="1h30"
          className={`${controleCls("compacto")} w-24`}
        />
        <button
          onClick={apontar}
          disabled={ocupado || !duracao}
          className="rounded-lg border border-linha px-3 py-1.5 text-cinza disabled:opacity-60"
        >
          Apontar
        </button>
      </div>
      {erro && (
        <p role="alert" className="text-xs text-negativo">
          {erro}
        </p>
      )}
    </section>
  );
}
