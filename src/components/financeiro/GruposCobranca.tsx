"use client";
import { controleCls } from "@/components/ui/Campo";
import { useState, useTransition } from "react";
import { Botao } from "@/components/ui/Botao";
import {
  criarGrupo,
  renomearGrupo,
  adicionarMembro,
  removerMembro,
  definirTitular,
  excluirGrupo,
  listarGrupos,
  listarClientesSemGrupo,
  boletosDoGrupo,
  type GrupoView,
  type BoletoGrupoView,
} from "@/app/(app)/financeiro/grupos-cobranca/actions";
import { emitirBoletoGrupo } from "@/app/(app)/financeiro/contas-a-receber/boleto-actions";
import { mesAnteriorDeHoje } from "@/lib/financeiro/competencia";
import { formatarData } from "@/lib/format";

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
type Opcao = { id: string; nome: string };

export function GruposCobranca({ gruposIni, semGrupoIni }: { gruposIni: GrupoView[]; semGrupoIni: Opcao[] }) {
  const [grupos, setGrupos] = useState(gruposIni);
  const [semGrupo, setSemGrupo] = useState(semGrupoIni);
  const [novoNome, setNovoNome] = useState("");
  const [novoTitular, setNovoTitular] = useState("");
  const [nomeEdit, setNomeEdit] = useState<Record<string, string>>({});
  const [addSel, setAddSel] = useState<Record<string, string>>({});
  const [comp, setComp] = useState<Record<string, string>>({});
  const [bols, setBols] = useState<Record<string, BoletoGrupoView[]>>({});
  const [msg, setMsg] = useState("");
  const [pend, start] = useTransition();
  const inp = controleCls("compacto");
  const mesDe = (g: string) => comp[g] ?? mesAnteriorDeHoje();

  const gerarBoleto = (grupoId: string) =>
    start(async () => {
      const r = await emitirBoletoGrupo(grupoId, `${mesDe(grupoId)}-01`);
      setMsg(r.erro ?? r.pulado ?? "Boleto consolidado gerado.");
      const lista = await boletosDoGrupo(grupoId);
      setBols((s) => ({ ...s, [grupoId]: lista }));
    });
  const verBoletos = (grupoId: string) =>
    start(async () => {
      const lista = await boletosDoGrupo(grupoId);
      setBols((s) => ({ ...s, [grupoId]: lista }));
    });

  const recarregar = () =>
    start(async () => {
      setGrupos(await listarGrupos());
      setSemGrupo(await listarClientesSemGrupo());
    });
  const rodar = (fn: () => Promise<{ erro?: string }>) =>
    start(async () => {
      const r = await fn();
      setMsg(r.erro ?? "");
      if (!r.erro) {
        setGrupos(await listarGrupos());
        setSemGrupo(await listarClientesSemGrupo());
      }
    });

  return (
    <div className="space-y-4">
      {msg && <p className="text-sm text-negativo">{msg}</p>}

      {/* Novo grupo */}
      <div className="flex flex-col gap-2 rounded-2xl border border-linha bg-white p-4">
        <h2 className="text-sm font-semibold text-texto">Novo grupo de cobrança</h2>
        <div className="flex flex-wrap items-end gap-2">
          <input
            value={novoNome}
            onChange={(e) => setNovoNome(e.target.value)}
            placeholder="Nome do grupo"
            className={inp}
          />
          <select value={novoTitular} onChange={(e) => setNovoTitular(e.target.value)} className={inp}>
            <option value="">Empresa titular…</option>
            {semGrupo.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
          <Botao
            variante="primario"
            disabled={pend || !novoNome.trim() || !novoTitular}
            onClick={() =>
              start(async () => {
                const r = await criarGrupo(novoNome, novoTitular);
                setMsg(r.erro ?? "");
                if (!r.erro) {
                  setNovoNome("");
                  setNovoTitular("");
                  setGrupos(await listarGrupos());
                  setSemGrupo(await listarClientesSemGrupo());
                }
              })
            }
          >
            Criar grupo
          </Botao>
        </div>
      </div>

      {grupos.length === 0 && <p className="text-sm text-cinza">Nenhum grupo de cobrança criado ainda.</p>}

      {grupos.map((g) => (
        <div key={g.id} className="space-y-2 rounded-2xl border border-linha bg-white p-4">
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={nomeEdit[g.id] ?? g.nome}
              onChange={(e) => setNomeEdit((s) => ({ ...s, [g.id]: e.target.value }))}
              className={inp}
            />
            <Botao
              variante="secundario"
              disabled={pend}
              onClick={() => rodar(() => renomearGrupo(g.id, nomeEdit[g.id] ?? g.nome))}
            >
              Salvar nome
            </Botao>
            <span className="ml-auto text-sm font-medium">Total do boleto: {brl(g.total)}</span>
            <button
              type="button"
              className="text-xs text-negativo underline"
              disabled={pend}
              onClick={() => rodar(() => excluirGrupo(g.id))}
            >
              Excluir grupo
            </button>
          </div>

          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-linha text-left text-xs text-cinza">
                <th className="px-2 py-1 font-medium">Empresa</th>
                <th className="px-2 py-1 font-medium">CNPJ</th>
                <th className="px-2 py-1 text-right font-medium">Honorário</th>
                <th className="px-2 py-1 font-medium">Titular</th>
                <th className="px-2 py-1" />
              </tr>
            </thead>
            <tbody>
              {g.membros.map((m) => (
                <tr key={m.clienteId} className="border-b border-linha/60">
                  <td className="px-2 py-1 text-texto">{m.razaoSocial}</td>
                  <td className="px-2 py-1 tabular-nums">{m.documento}</td>
                  <td className="px-2 py-1 text-right tabular-nums">{brl(m.honorario)}</td>
                  <td className="px-2 py-1">
                    {m.titular ? (
                      <span className="text-verde">Titular</span>
                    ) : (
                      <button
                        type="button"
                        className="text-xs text-blue-600 underline"
                        disabled={pend}
                        onClick={() => rodar(() => definirTitular(g.id, m.clienteId))}
                      >
                        Tornar titular
                      </button>
                    )}
                  </td>
                  <td className="px-2 py-1 text-right">
                    {!m.titular && (
                      <button
                        type="button"
                        className="text-xs text-negativo underline"
                        disabled={pend}
                        onClick={() => rodar(() => removerMembro(m.clienteId))}
                      >
                        Remover
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={addSel[g.id] ?? ""}
              onChange={(e) => setAddSel((s) => ({ ...s, [g.id]: e.target.value }))}
              className={inp}
            >
              <option value="">Adicionar empresa…</option>
              {semGrupo.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
            <Botao
              variante="secundario"
              disabled={pend || !addSel[g.id]}
              onClick={() =>
                rodar(async () => {
                  const r = await adicionarMembro(g.id, addSel[g.id]!);
                  setAddSel((s) => ({ ...s, [g.id]: "" }));
                  return r;
                })
              }
            >
              Adicionar
            </Botao>
          </div>

          {/* Boleto consolidado do grupo */}
          <div className="mt-2 space-y-1 border-t border-linha/60 pt-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-cinza">Boleto consolidado</span>
              <input
                type="month"
                value={mesDe(g.id)}
                onChange={(e) => setComp((s) => ({ ...s, [g.id]: e.target.value }))}
                className={inp}
              />
              <Botao variante="secundario" disabled={pend} onClick={() => gerarBoleto(g.id)}>
                Gerar boleto do grupo
              </Botao>
              <button
                type="button"
                className="text-xs text-cinza underline"
                disabled={pend}
                onClick={() => verBoletos(g.id)}
              >
                Ver boletos
              </button>
            </div>
            {bols[g.id]?.length ? (
              <ul className="text-xs text-cinza">
                {bols[g.id]!.map((b) => (
                  <li key={b.id} className="tabular-nums">
                    #{b.numero} · {brl(b.valor)} · venc {formatarData(b.vencimento)} · {b.status}
                    {b.linhaDigitavel ? ` · ${b.linhaDigitavel}` : ""}
                  </li>
                ))}
              </ul>
            ) : bols[g.id] ? (
              <p className="text-xs text-cinza-claro">Nenhum boleto consolidado ainda.</p>
            ) : null}
          </div>
        </div>
      ))}
      <button type="button" className="text-xs text-cinza underline" onClick={recarregar} disabled={pend}>
        Atualizar
      </button>
    </div>
  );
}
