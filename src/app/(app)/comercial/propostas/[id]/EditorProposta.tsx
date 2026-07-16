"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { salvarProposta, definirStatusProposta, type PropostaView, type PropostaStatus } from "../../propostas-actions";
import { gerarDocumentoProposta } from "./gerar-actions";
import { totaisProposta, type ItemRecorrencia } from "@/lib/comercial/proposta";
import { Botao } from "@/components/ui/Botao";

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
type Linha = { descricao: string; valor: number; recorrencia: ItemRecorrencia };
const STATUS: { v: PropostaStatus; l: string }[] = [
  { v: "rascunho", l: "Rascunho" },
  { v: "enviada", l: "Enviada" },
  { v: "aceita", l: "Aceita" },
  { v: "recusada", l: "Recusada" },
];

export function EditorProposta({
  proposta,
  responsavelPadrao,
}: {
  proposta: PropostaView;
  responsavelPadrao: { nome: string; email: string };
}) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);
  const [validade, setValidade] = useState(proposta.validade ?? "");
  const [observacoes, setObservacoes] = useState(proposta.observacoes ?? "");
  const [respNome, setRespNome] = useState(proposta.responsavel.nome ?? responsavelPadrao.nome);
  const [respEmail, setRespEmail] = useState(proposta.responsavel.email ?? responsavelPadrao.email);
  const [respTelefone, setRespTelefone] = useState(proposta.responsavel.telefone ?? "");
  const [itens, setItens] = useState<Linha[]>(
    proposta.itens.length
      ? proposta.itens.map((i) => ({ descricao: i.descricao, valor: i.valor, recorrencia: i.recorrencia }))
      : [{ descricao: "", valor: 0, recorrencia: "mensal" }],
  );
  const t = totaisProposta(itens);

  function setItem(idx: number, patch: Partial<Linha>) {
    setItens(itens.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }
  async function salvar() {
    setOcupado(true);
    const r = await salvarProposta(proposta.id, {
      validade: validade || null,
      observacoes: observacoes || null,
      itens,
      responsavel: { nome: respNome || null, email: respEmail || null, telefone: respTelefone || null },
    });
    setOcupado(false);
    if (r.erro) return alert(r.erro);
    router.refresh();
  }
  async function gerar() {
    setOcupado(true);
    const r = await gerarDocumentoProposta(proposta.id);
    setOcupado(false);
    if (r.erro) return alert(r.erro);
    if (r.modelo === "padrao") {
      router.push(`/comercial/propostas/${proposta.id}/documento`);
      return;
    }
    if (r.pdfBase64 && r.nome) {
      const bytes = Uint8Array.from(atob(r.pdfBase64), (c) => c.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = r.nome;
      a.click();
      URL.revokeObjectURL(url);
    }
  }
  async function status(s: PropostaStatus) {
    setOcupado(true);
    const r = await definirStatusProposta(proposta.id, s);
    setOcupado(false);
    if (r.erro) return alert(r.erro);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link href={`/comercial/propostas?op=${proposta.oportunidadeId}`} className="text-sm text-verde underline">
          ← Propostas
        </Link>
        <div className="flex items-center gap-3">
          <Link href={`/comercial/propostas/${proposta.id}/documento`} className="text-sm text-verde underline">
            Ver documento
          </Link>
          <button
            type="button"
            disabled={ocupado}
            onClick={gerar}
            className="text-sm text-verde underline disabled:opacity-60"
          >
            Gerar documento
          </button>
        </div>
      </div>

      <div className="space-y-1">
        <p className="text-sm text-cinza">
          Proposta nº <span className="font-medium text-texto tabular-nums">{proposta.numero}</span> ·{" "}
          {proposta.prospectNome}
        </p>
        <div className="flex flex-wrap gap-1 text-xs">
          {STATUS.map((s) => (
            <button
              key={s.v}
              type="button"
              disabled={ocupado}
              onClick={() => status(s.v)}
              className={`rounded border px-2 py-0.5 ${proposta.status === s.v ? "border-verde bg-verde/10 text-verde" : "border-linha text-cinza"}`}
            >
              {s.l}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2 rounded-2xl border border-linha bg-white p-3">
        <h3 className="font-display text-sm font-semibold text-texto">Itens</h3>
        {itens.map((it, idx) => (
          <div key={idx} className="flex flex-wrap items-center gap-2">
            <input
              value={it.descricao}
              onChange={(e) => setItem(idx, { descricao: e.target.value })}
              placeholder="Descrição"
              className="flex-1 rounded-lg border border-linha px-2 py-1.5 text-sm"
            />
            <input
              type="number"
              value={it.valor || ""}
              onChange={(e) => setItem(idx, { valor: e.target.value === "" ? 0 : Number(e.target.value) })}
              placeholder="Valor"
              className="w-28 rounded-lg border border-linha px-2 py-1.5 text-sm"
            />
            <select
              value={it.recorrencia}
              onChange={(e) => setItem(idx, { recorrencia: e.target.value as ItemRecorrencia })}
              className="rounded-lg border border-linha px-2 py-1.5 text-sm"
            >
              <option value="mensal">Mensal</option>
              <option value="unico">Único</option>
            </select>
            <button
              type="button"
              onClick={() => setItens(itens.filter((_, i) => i !== idx))}
              className="text-xs text-negativo underline"
            >
              remover
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => setItens([...itens, { descricao: "", valor: 0, recorrencia: "mensal" }])}
          className="text-xs text-verde underline"
        >
          + item
        </button>
        <p className="pt-1 text-sm text-texto">
          Total: <span className="font-medium tabular-nums">Mensal {brl(t.mensal)}</span> ·{" "}
          <span className="font-medium tabular-nums">Único {brl(t.unico)}</span>
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <label className="text-xs text-cinza">
          Validade
          <input
            type="date"
            value={validade}
            onChange={(e) => setValidade(e.target.value)}
            className="mt-0.5 block rounded-lg border border-linha px-2 py-1.5 text-sm"
          />
        </label>
        <label className="flex-1 text-xs text-cinza">
          Observações / condições
          <textarea
            value={observacoes}
            onChange={(e) => setObservacoes(e.target.value)}
            rows={3}
            className="mt-0.5 block w-full rounded-lg border border-linha px-2 py-1.5 text-sm"
          />
        </label>
      </div>

      <div className="space-y-2 rounded-2xl border border-linha bg-white p-3">
        <h3 className="font-display text-sm font-semibold text-texto">Responsável comercial</h3>
        <div className="flex flex-wrap gap-2">
          <label className="flex-1 text-xs text-cinza">
            Nome
            <input
              value={respNome}
              onChange={(e) => setRespNome(e.target.value)}
              className="mt-0.5 block w-full rounded-lg border border-linha px-2 py-1.5 text-sm"
            />
          </label>
          <label className="flex-1 text-xs text-cinza">
            E-mail
            <input
              value={respEmail}
              onChange={(e) => setRespEmail(e.target.value)}
              className="mt-0.5 block w-full rounded-lg border border-linha px-2 py-1.5 text-sm"
            />
          </label>
          <label className="flex-1 text-xs text-cinza">
            Telefone
            <input
              value={respTelefone}
              onChange={(e) => setRespTelefone(e.target.value)}
              className="mt-0.5 block w-full rounded-lg border border-linha px-2 py-1.5 text-sm"
            />
          </label>
        </div>
      </div>

      <div className="flex justify-end">
        <Botao variante="primario" disabled={ocupado} onClick={salvar}>
          Salvar
        </Botao>
      </div>
    </div>
  );
}
