"use client";
import { useState } from "react";
import { formatarMoeda } from "@/lib/format";
import {
  parsearOFX,
  cabecalhosCSV,
  parsearCSV,
  dedupHash,
  type MovimentoBruto,
  type MapaCSV,
} from "@/lib/conciliacao/parse";
import { importarMovimentos, jaImportados, listarMovimentos, type MovimentoView } from "./actions";
import { conciliarAutomaticos } from "./conciliar-actions";
import { AcaoMovimento } from "./AcaoMovimento";

const dataBR = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const acharCol = (cols: string[], termos: string[]) =>
  cols.find((c) => termos.some((t) => c.toLowerCase().includes(t))) ?? "";

export function Conciliacao({
  contas,
  inicio: iniIni,
  fim: fimIni,
  contaInicial,
  movimentosIni,
  categorias,
  clientes,
  fornecedores,
}: {
  contas: { id: string; nome: string }[];
  inicio: string;
  fim: string;
  contaInicial: string;
  movimentosIni: MovimentoView[];
  categorias: { id: string; nome: string }[];
  clientes: { id: string; nome: string }[];
  fornecedores: { id: string; nome: string }[];
}) {
  const [conta, setConta] = useState(contaInicial);
  const [inicio, setInicio] = useState(iniIni);
  const [fim, setFim] = useState(fimIni);
  const [status, setStatus] = useState("");
  const [lista, setLista] = useState<MovimentoView[]>(movimentosIni);
  const [textoCSV, setTextoCSV] = useState<string | null>(null);
  const [cabecalhos, setCabecalhos] = useState<string[]>([]);
  const [mapa, setMapa] = useState<MapaCSV>({ data: "", valor: "", descricao: "" });
  const [previa, setPrevia] = useState<{ mov: MovimentoBruto; novo: boolean }[] | null>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function recarregar(c: string, i: string, f: string, s: string) {
    setConta(c);
    setInicio(i);
    setFim(f);
    setStatus(s);
    setLista(await listarMovimentos(c, i, f, s));
  }

  async function montarPrevia(movs: MovimentoBruto[]) {
    if (movs.length === 0) {
      setPrevia([]);
      setMsg("Nenhuma movimentação reconhecida — confira o formato/arquivo.");
      return;
    }
    const hashes = movs.map(dedupHash);
    const existentes = new Set(await jaImportados(conta, hashes));
    setPrevia(movs.map((mov) => ({ mov, novo: !existentes.has(dedupHash(mov)) })));
    setMsg("");
  }

  async function aoEscolherArquivo(file: File) {
    setPrevia(null);
    setCabecalhos([]);
    setTextoCSV(null);
    setMsg("");
    const texto = await file.text();
    if (/\.ofx$/i.test(file.name) || /<OFX>/i.test(texto)) {
      await montarPrevia(parsearOFX(texto));
    } else {
      const cols = cabecalhosCSV(texto);
      setTextoCSV(texto);
      setCabecalhos(cols);
      const m: MapaCSV = {
        data: acharCol(cols, ["data", "date"]),
        valor: acharCol(cols, ["valor", "amount", "montante"]),
        descricao: acharCol(cols, ["hist", "descr", "memo", "lançamento", "lancamento"]),
      };
      setMapa(m);
      if (m.data && m.valor) await montarPrevia(parsearCSV(texto, m));
    }
  }

  async function remapear(next: MapaCSV) {
    setMapa(next);
    if (textoCSV && next.data && next.valor) await montarPrevia(parsearCSV(textoCSV, next));
  }

  async function importar() {
    if (!previa) return;
    setBusy(true);
    const r = await importarMovimentos(
      conta,
      previa.map((p) => p.mov),
    );
    setBusy(false);
    if ("erro" in r) {
      setMsg(r.erro);
      return;
    }
    setMsg(`${r.inseridos} importada(s), ${r.ignorados} já existentes.`);
    setPrevia(null);
    await recarregar(conta, inicio, fim, status);
  }

  const novos = previa?.filter((p) => p.novo).length ?? 0;
  const creditos = lista.filter((m) => m.valor > 0).reduce((s, m) => s + m.valor, 0);
  const debitos = lista.filter((m) => m.valor < 0).reduce((s, m) => s + m.valor, 0);
  const inp = "rounded-lg border border-linha px-2 py-1 text-sm";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <select value={conta} onChange={(e) => recarregar(e.target.value, inicio, fim, status)} className={inp}>
          {contas.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome}
            </option>
          ))}
        </select>
        <label className="cursor-pointer rounded-lg bg-verde px-3 py-1.5 text-sm font-medium text-white">
          Importar extrato (OFX/CSV)
          <input
            type="file"
            accept=".ofx,.csv,text/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) aoEscolherArquivo(f);
              e.target.value = "";
            }}
          />
        </label>
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            const r = await conciliarAutomaticos(conta);
            setBusy(false);
            if ("conciliados" in r) {
              setMsg(`${r.conciliados} conciliada(s) automaticamente.`);
              await recarregar(conta, inicio, fim, status);
            } else setMsg(r.erro);
          }}
          className="rounded-lg border border-linha px-3 py-1.5 text-sm"
        >
          Conciliar automáticos
        </button>
        {msg && <span className="text-sm text-cinza">{msg}</span>}
      </div>

      {cabecalhos.length > 0 && !previa && (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-linha bg-white p-3 text-sm">
          <span className="text-cinza">Mapear colunas do CSV:</span>
          {(["data", "valor", "descricao"] as const).map((campo) => (
            <label key={campo} className="text-cinza">
              {campo}
              <select
                value={mapa[campo]}
                onChange={(e) => remapear({ ...mapa, [campo]: e.target.value })}
                className={`${inp} ml-1`}
              >
                <option value="">—</option>
                {cabecalhos.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
      )}

      {previa && previa.length > 0 && (
        <div className="space-y-2 rounded-2xl border border-linha bg-white p-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-texto">
              Prévia · {previa.length} linha(s), {novos} nova(s)
            </span>
            <button
              type="button"
              disabled={busy || novos === 0}
              onClick={importar}
              className="rounded-lg bg-verde px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
            >
              Importar {novos} nova(s)
            </button>
          </div>
          <div className="max-h-64 overflow-y-auto">
            <table className="min-w-full text-sm">
              <tbody>
                {previa.map((p, i) => (
                  <tr key={i} className="border-b border-linha/40">
                    <td className="px-2 py-1">{dataBR(p.mov.data)}</td>
                    <td className="px-2 py-1 text-texto">{p.mov.descricao}</td>
                    <td
                      className={`px-2 py-1 text-right tabular-nums ${p.mov.valor < 0 ? "text-negativo" : "text-verde"}`}
                    >
                      {formatarMoeda(p.mov.valor)}
                    </td>
                    <td className="px-2 py-1 text-xs">
                      {p.novo ? (
                        <span className="text-verde">novo</span>
                      ) : (
                        <span className="text-cinza">já importado</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="date"
          value={inicio}
          onChange={(e) => recarregar(conta, e.target.value, fim, status)}
          className={inp}
        />
        <input
          type="date"
          value={fim}
          onChange={(e) => recarregar(conta, inicio, e.target.value, status)}
          className={inp}
        />
        <select value={status} onChange={(e) => recarregar(conta, inicio, fim, e.target.value)} className={inp}>
          <option value="">Todos status</option>
          <option value="pendente">Pendente</option>
          <option value="conciliada">Conciliada</option>
          <option value="ignorada">Ignorada</option>
        </select>
        <span className="ml-auto text-sm text-cinza">
          Créditos <strong className="text-verde">{formatarMoeda(creditos)}</strong> · Débitos{" "}
          <strong className="text-negativo">{formatarMoeda(debitos)}</strong>
        </span>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-linha bg-white">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-linha text-left text-xs text-cinza">
              <th className="px-3 py-2 font-medium">Data</th>
              <th className="px-3 py-2 font-medium">Descrição</th>
              <th className="px-3 py-2 text-right font-medium">Valor</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Ação</th>
            </tr>
          </thead>
          <tbody>
            {lista.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-3 text-cinza">
                  Nenhuma movimentação no período.
                </td>
              </tr>
            )}
            {lista.map((m) => (
              <tr key={m.id} className="border-b border-linha/60 align-top">
                <td className="px-3 py-1.5">{dataBR(m.data)}</td>
                <td className="px-3 py-1.5 text-texto">{m.descricao}</td>
                <td className={`px-3 py-1.5 text-right tabular-nums ${m.valor < 0 ? "text-negativo" : "text-verde"}`}>
                  {formatarMoeda(m.valor)}
                </td>
                <td className="px-3 py-1.5">{m.status}</td>
                <td className="px-3 py-1.5">
                  <AcaoMovimento
                    mov={m}
                    categorias={categorias}
                    clientes={clientes}
                    fornecedores={fornecedores}
                    onDone={() => recarregar(conta, inicio, fim, status)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
