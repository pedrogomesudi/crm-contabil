"use client";
import { controleCls } from "@/components/ui/Campo";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { atualizarEtapa, anexarComprovanteEtapa } from "@/app/(app)/legalizacao/actions";
import { rotuloOrgao, etapaConcluida, type LegOrgao, type LegEtapaStatus } from "@/lib/legalizacao/tipos";
import { classificarAlerta } from "@/lib/onboarding/alertas";

type Etapa = {
  id: string;
  ordem: number;
  titulo: string;
  descricao: string | null;
  orgao: LegOrgao;
  orgaoOutro: string | null;
  prazo: string | null;
  status: LegEtapaStatus;
  protocolo: string | null;
  protocoloEm: string | null;
  anexoObrigatorio: boolean;
  anexoUrl: string | null;
  avisarCliente: boolean;
  clienteAvisadoEm: string | null;
  observacao: string | null;
};

const STATUS: { v: LegEtapaStatus; l: string }[] = [
  { v: "pendente", l: "Pendente" },
  { v: "em_andamento", l: "Em andamento" },
  { v: "concluido", l: "Concluído" },
  { v: "isenta", l: "Isenta" },
];
const SEV: Record<string, string> = {
  em_breve: "text-atencao",
  vencido: "text-negativo",
  critico: "text-negativo font-semibold",
};
const dataBR = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "—");

export function EtapaLinha({ etapa, hoje }: { etapa: Etapa; hoje: string }) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);
  const [protocolo, setProtocolo] = useState(etapa.protocolo ?? "");
  const [protocoloEm, setProtocoloEm] = useState(etapa.protocoloEm ?? "");
  const [prazo, setPrazo] = useState(etapa.prazo ?? "");
  const [orgaoOutro, setOrgaoOutro] = useState(etapa.orgaoOutro ?? "");
  const [obs, setObs] = useState(etapa.observacao ?? "");

  async function salvar(patch: Parameters<typeof atualizarEtapa>[1]) {
    setOcupado(true);
    const r = await atualizarEtapa(etapa.id, patch);
    setOcupado(false);
    if (r.erro) return alert(r.erro);
    router.refresh();
  }
  async function enviar(form: FormData) {
    setOcupado(true);
    const r = await anexarComprovanteEtapa(etapa.id, form);
    setOcupado(false);
    if (r.erro) return alert(r.erro);
    router.refresh();
  }

  const concluida = etapaConcluida(etapa.status);
  const sev = !concluida && etapa.prazo ? classificarAlerta(etapa.prazo, hoje) : null;

  return (
    <div className={`rounded-2xl border border-linha bg-white p-3 ${concluida ? "opacity-80" : ""}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-xs text-cinza">{etapa.ordem}</span>
          <span className="font-medium text-texto">{etapa.titulo}</span>
          <span className="text-xs text-cinza">· {rotuloOrgao(etapa.orgao, etapa.orgaoOutro)}</span>
        </div>
        <select
          disabled={ocupado}
          value={etapa.status}
          onChange={(e) => salvar({ status: e.target.value as LegEtapaStatus })}
          className={controleCls("compacto")}
        >
          {STATUS.map((s) => (
            <option key={s.v} value={s.v}>
              {s.l}
            </option>
          ))}
        </select>
      </div>
      {etapa.descricao && <p className="mt-1 text-xs text-cinza">{etapa.descricao}</p>}

      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <label className="text-xs text-cinza">
          Protocolo
          <div className="mt-0.5 flex gap-1">
            <input
              value={protocolo}
              onChange={(e) => setProtocolo(e.target.value)}
              onBlur={() => protocolo !== (etapa.protocolo ?? "") && salvar({ protocolo: protocolo || null })}
              className={`${controleCls("compacto")} w-full`}
            />
          </div>
        </label>
        <label className="text-xs text-cinza">
          Data do protocolo
          <input
            type="date"
            value={protocoloEm}
            onChange={(e) => {
              setProtocoloEm(e.target.value);
              salvar({ protocoloEm: e.target.value || null });
            }}
            className={`${controleCls("compacto")} mt-0.5 block w-full`}
          />
        </label>
        <label className="text-xs text-cinza">
          Prazo
          <input
            type="date"
            value={prazo}
            onChange={(e) => {
              setPrazo(e.target.value);
              salvar({ prazo: e.target.value || null });
            }}
            className={`${controleCls("compacto")} mt-0.5 block w-full`}
          />
          {sev && (
            <span className={`ml-1 text-[11px] ${SEV[sev]}`}>
              {sev === "em_breve" ? "vence em breve" : sev === "vencido" ? "vencido" : "muito atrasado"}
            </span>
          )}
        </label>
        {etapa.orgao === "outro" && (
          <label className="text-xs text-cinza">
            Órgão (rótulo)
            <input
              value={orgaoOutro}
              onChange={(e) => setOrgaoOutro(e.target.value)}
              onBlur={() => orgaoOutro !== (etapa.orgaoOutro ?? "") && salvar({ orgaoOutro: orgaoOutro || null })}
              className={`${controleCls("compacto")} mt-0.5 block w-full`}
            />
          </label>
        )}
      </div>

      <label className="mt-2 block text-xs text-cinza">
        Observação
        <textarea
          value={obs}
          onChange={(e) => setObs(e.target.value)}
          onBlur={() => obs !== (etapa.observacao ?? "") && salvar({ observacao: obs || null })}
          rows={2}
          className={`${controleCls("compacto")} mt-0.5 block w-full`}
        />
      </label>

      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
        {etapa.anexoUrl ? (
          <a href={etapa.anexoUrl} target="_blank" rel="noopener noreferrer" className="text-verde underline">
            ver comprovante
          </a>
        ) : etapa.anexoObrigatorio ? (
          <span className="text-atencao">comprovante obrigatório</span>
        ) : null}
        <form action={enviar} className="flex items-center gap-1">
          <input type="file" name="comprovante" accept=".pdf,image/png,image/jpeg" className="text-xs" />
          <button disabled={ocupado} className="rounded-lg border border-linha px-2 py-1 disabled:opacity-60">
            Anexar
          </button>
        </form>
        {etapa.avisarCliente && (
          <label className="ml-auto flex items-center gap-1 text-cinza">
            <input
              type="checkbox"
              checked={!!etapa.clienteAvisadoEm}
              onChange={(e) => salvar({ clienteAvisado: e.target.checked })}
            />
            cliente avisado {etapa.clienteAvisadoEm ? `· ${dataBR(etapa.clienteAvisadoEm.slice(0, 10))}` : ""}
          </label>
        )}
      </div>
    </div>
  );
}
