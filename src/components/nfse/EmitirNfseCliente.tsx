"use client";
import { useActionState, useState } from "react";
import {
  emitirComoEmitente,
  consultarCnpjTomador,
  type EstadoEmitente,
} from "@/app/(app)/clientes/[id]/nfse-emitente";
import { mesAnteriorDeHoje } from "@/lib/financeiro/competencia";

const inputCls =
  "rounded-lg border border-linha bg-white px-3 py-2 text-sm text-texto placeholder:text-cinza-claro focus:border-verde";

type CamposTomador = {
  doc: string;
  razao: string;
  cep: string;
  logradouro: string;
  numero: string;
  bairro: string;
  cidade: string;
  uf: string;
  cmun: string;
};

export function EmitirNfseCliente({ clienteId, ambiente }: { clienteId: string; ambiente: string }) {
  const [estado, action, pend] = useActionState<EstadoEmitente, FormData>(
    emitirComoEmitente.bind(null, clienteId),
    {},
  );
  const [aberto, setAberto] = useState(false);
  const [mes, setMes] = useState(mesAnteriorDeHoje());
  const [f, setF] = useState<CamposTomador>({
    doc: "",
    razao: "",
    cep: "",
    logradouro: "",
    numero: "",
    bairro: "",
    cidade: "",
    uf: "",
    cmun: "",
  });
  const [buscando, setBuscando] = useState(false);
  const [msgBusca, setMsgBusca] = useState<{ ok: boolean; texto: string } | null>(null);
  const set = (k: keyof CamposTomador) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setF((p) => ({ ...p, [k]: e.target.value }));

  async function buscarReceita() {
    setBuscando(true);
    setMsgBusca(null);
    const r = await consultarCnpjTomador(f.doc);
    setBuscando(false);
    if (r.erro || !r.ok) {
      setMsgBusca({ ok: false, texto: r.erro ?? "Não encontrado na Receita." });
      return;
    }
    const e = r.endereco ?? {};
    setF((p) => ({
      ...p,
      razao: r.razaoSocial ?? p.razao,
      cep: e.cep ?? p.cep,
      logradouro: e.logradouro ?? p.logradouro,
      numero: e.numero ?? p.numero,
      bairro: e.bairro ?? p.bairro,
      cidade: e.cidade ?? p.cidade,
      uf: e.uf ?? p.uf,
      cmun: r.codigoMunicipio ?? p.cmun,
    }));
    setMsgBusca({ ok: true, texto: "Dados preenchidos pela Receita ✓" });
  }

  if (estado.ok) return <span className="text-xs text-verde">NFS-e emitida ✓</span>;
  if (!aberto)
    return (
      <button
        onClick={() => setAberto(true)}
        className="rounded-lg border border-linha px-2 py-1 text-xs text-cinza hover:bg-creme"
      >
        Emitir NFS-e
      </button>
    );

  return (
    <form action={action} className="mt-2 space-y-2 rounded-lg border border-linha p-3 text-sm">
      {ambiente === "homologacao" && (
        <p className="rounded bg-amber-50 px-2 py-1 text-amber-800">Homologação — sem validade jurídica.</p>
      )}
      <p className="font-medium text-cinza">Tomador</p>
      <div className="flex items-center gap-2">
        <input
          name="tomador_documento"
          value={f.doc}
          onChange={set("doc")}
          placeholder="CNPJ/CPF"
          required
          className={`flex-1 ${inputCls}`}
        />
        <button
          type="button"
          onClick={buscarReceita}
          disabled={buscando || f.doc.replace(/\D/g, "").length !== 14}
          className="shrink-0 rounded-lg border border-linha px-3 py-2 text-sm text-cinza hover:bg-creme disabled:opacity-60"
          title="Preenche razão social e endereço pelo CNPJ (Receita Federal)"
        >
          {buscando ? "Buscando…" : "Buscar na Receita"}
        </button>
      </div>
      {msgBusca && <p className={`text-xs ${msgBusca.ok ? "text-verde" : "text-negativo"}`}>{msgBusca.texto}</p>}
      <div className="grid grid-cols-2 gap-2">
        <input name="tomador_razao_social" value={f.razao} onChange={set("razao")} placeholder="Razão social" required className={inputCls} />
        <input name="tom_cep" value={f.cep} onChange={set("cep")} placeholder="CEP" required className={inputCls} />
        <input name="tom_logradouro" value={f.logradouro} onChange={set("logradouro")} placeholder="Logradouro" required className={inputCls} />
        <input name="tom_numero" value={f.numero} onChange={set("numero")} placeholder="Número" className={inputCls} />
        <input name="tom_bairro" value={f.bairro} onChange={set("bairro")} placeholder="Bairro" className={inputCls} />
        <input name="tom_cidade" value={f.cidade} onChange={set("cidade")} placeholder="Cidade" className={inputCls} />
        <input name="tom_uf" value={f.uf} onChange={set("uf")} placeholder="UF" maxLength={2} className={inputCls} />
        <input name="tom_cmun" value={f.cmun} onChange={set("cmun")} placeholder="Cód. município (IBGE)" className={inputCls} />
      </div>
      <p className="font-medium text-cinza">Serviço</p>
      <input
        name="descricao_servico"
        placeholder="Descrição do serviço"
        className={`w-full ${inputCls}`}
      />
      <label className="block text-cinza">
        Valor (R$)
        <input type="number" name="valor" step="0.01" min="0" required className={`ml-2 w-32 ${inputCls}`} />
      </label>
      <label className="block text-cinza">
        Competência
        <input
          type="month"
          required
          value={mes}
          onChange={(e) => setMes(e.target.value)}
          className={`ml-2 ${inputCls}`}
        />
      </label>
      <input type="hidden" name="competencia" value={mes ? `${mes}-01` : ""} />
      {estado.erro && (
        <p role="alert" className="text-negativo">
          {estado.erro}
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pend}
          className="rounded-lg bg-verde px-3 py-1 text-sm font-medium text-white hover:brightness-105 disabled:opacity-60"
        >
          {pend ? "Emitindo..." : "Emitir"}
        </button>
        <button type="button" onClick={() => setAberto(false)} className="rounded-lg border border-linha px-3 py-1">
          Cancelar
        </button>
      </div>
    </form>
  );
}
