import { formatarData } from "@/lib/format";
import type { PassoAgenda } from "@/lib/comercial/followup";

const ROTULO: Record<PassoAgenda["situacao"], string> = {
  enviado: "Enviado",
  falhou: "Falhou",
  sem_destino: "Sem contato",
  pendente: "Pendente",
  agendado: "Agendado",
};
const COR: Record<PassoAgenda["situacao"], string> = {
  enviado: "text-verde",
  falhou: "text-negativo",
  sem_destino: "text-atencao",
  pendente: "text-cinza",
  agendado: "text-cinza-claro",
};

export function FollowupProposta({ enviada, passos }: { enviada: boolean; passos: PassoAgenda[] }) {
  return (
    <div className="space-y-2 rounded-2xl border border-linha bg-white p-4">
      <h3 className="font-display text-sm font-semibold text-texto">Follow-up</h3>
      {!enviada ? (
        <p className="text-xs text-cinza">O follow-up começa quando a proposta for enviada.</p>
      ) : passos.length === 0 ? (
        <p className="text-xs text-cinza">Nenhuma etapa de follow-up configurada.</p>
      ) : (
        <ul className="space-y-1.5 text-sm">
          {passos.map((p, i) => (
            <li key={i} className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs text-cinza">D+{p.dias}</span>
              <span className="tabular-nums text-cinza">{formatarData(p.dataPrevista)}</span>
              <span className={COR[p.situacao]}>
                {ROTULO[p.situacao]}
                {p.situacao === "enviado" && p.quando ? ` — em ${formatarData(p.quando)}` : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
