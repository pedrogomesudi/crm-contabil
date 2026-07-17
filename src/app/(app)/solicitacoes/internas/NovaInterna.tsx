"use client";
import { controleCls } from "@/components/ui/Campo";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { DEPARTAMENTOS, type Departamento } from "@/lib/clientes/departamentos";
import { slaDoDepartamento } from "@/lib/solicitacoes/interna";
import { abrirSolicitacaoInterna } from "./actions";

const cls = controleCls("compacto");

type Opcao = { id: string; nome: string };

export function NovaInterna({
  meuDepartamento,
  clientes,
  colaboradores,
  slas,
}: {
  meuDepartamento: Departamento | null;
  clientes: Opcao[];
  colaboradores: Opcao[];
  slas: { departamento: string; dias: number }[];
}) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [destino, setDestino] = useState<Departamento>("fiscal");
  const [origem, setOrigem] = useState<Departamento>(meuDepartamento ?? "contabil");
  const [assunto, setAssunto] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [clienteId, setClienteId] = useState("");
  const [responsavelId, setResponsavelId] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const sla = slaDoDepartamento(slas, destino);

  async function abrir() {
    setOcupado(true);
    setErro(null);
    const r = await abrirSolicitacaoInterna({
      destino,
      origem: meuDepartamento ?? origem,
      assunto,
      mensagem,
      clienteId: clienteId || null,
      responsavelId: responsavelId || null,
    });
    setOcupado(false);
    if (r.erro) return setErro(r.erro);
    if (r.id) router.push(`/solicitacoes/internas/${r.id}`);
  }

  if (!aberto) {
    return (
      <button onClick={() => setAberto(true)} className="rounded-lg bg-verde px-3 py-2 text-sm text-white">
        Nova solicitação interna
      </button>
    );
  }

  return (
    <div className="space-y-2 rounded-2xl border border-linha bg-white p-4 text-sm">
      <h2 className="font-display text-sm font-semibold text-texto">Nova solicitação interna</h2>

      <div className="flex flex-wrap gap-2">
        {!meuDepartamento && (
          <label className="text-xs text-cinza">
            Seu departamento
            <select
              value={origem}
              onChange={(e) => setOrigem(e.target.value as Departamento)}
              className={`mt-0.5 block ${cls}`}
            >
              {DEPARTAMENTOS.map((d) => (
                <option key={d.valor} value={d.valor}>
                  {d.rotulo}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="text-xs text-cinza">
          Para o departamento
          <select
            value={destino}
            onChange={(e) => setDestino(e.target.value as Departamento)}
            className={`mt-0.5 block ${cls}`}
          >
            {DEPARTAMENTOS.map((d) => (
              <option key={d.valor} value={d.valor}>
                {d.rotulo}
              </option>
            ))}
          </select>
          <span className="mt-0.5 block text-[11px] text-cinza-claro">
            Prazo: {sla.dias} dia(s){sla.padrao ? " (padrão — SLA não configurado)" : ""}
          </span>
        </label>
        <label className="text-xs text-cinza">
          Sobre o cliente (opcional)
          <select value={clienteId} onChange={(e) => setClienteId(e.target.value)} className={`mt-0.5 block ${cls}`}>
            <option value="">—</option>
            {clientes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-cinza">
          Responsável (opcional)
          <select
            value={responsavelId}
            onChange={(e) => setResponsavelId(e.target.value)}
            className={`mt-0.5 block ${cls}`}
          >
            <option value="">— deixar na fila —</option>
            {colaboradores.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="block text-xs text-cinza">
        Assunto
        <input value={assunto} onChange={(e) => setAssunto(e.target.value)} className={`mt-0.5 block w-full ${cls}`} />
      </label>
      <label className="block text-xs text-cinza">
        O que você precisa
        <textarea
          value={mensagem}
          onChange={(e) => setMensagem(e.target.value)}
          rows={4}
          className={`mt-0.5 block w-full ${cls}`}
        />
      </label>

      <div className="flex items-center gap-3">
        <button
          disabled={ocupado || !assunto || !mensagem}
          onClick={abrir}
          className="rounded-lg bg-verde px-3 py-1.5 text-white disabled:opacity-60"
        >
          {ocupado ? "Abrindo…" : "Abrir"}
        </button>
        <button type="button" onClick={() => setAberto(false)} className="text-xs text-cinza underline">
          cancelar
        </button>
        {erro && (
          <span role="alert" className="text-xs text-negativo">
            {erro}
          </span>
        )}
      </div>
      <p className="text-xs text-cinza-claro">
        O prazo é definido pelo SLA do departamento de destino — não é escolhido por quem abre.
      </p>
    </div>
  );
}
