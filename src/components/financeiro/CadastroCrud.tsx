"use client";
import Link from "next/link";
import { Container } from "@/components/ui/Container";
import { useActionState, useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Painel } from "@/components/ui/Painel";
import { Botao } from "@/components/ui/Botao";
import { Campo, inputCls } from "@/components/ui/Campo";
import { Badge } from "@/components/ui/Badge";

export type CampoDesc = {
  nome: string;
  label: string;
  tipo: "texto" | "numero" | "select" | "textarea";
  opcoes?: { valor: string; label: string }[];
  obrigatorio?: boolean;
};
export type RegistroCrud = { id: string; ativa: boolean; [k: string]: unknown };
export type EstadoCrud = { erro?: string; ok?: boolean };

export function CadastroCrud({
  titulo,
  campos,
  itens,
  salvar,
  alternarAtiva,
  voltarHref = "/financeiro/cadastros",
}: {
  titulo: string;
  campos: CampoDesc[];
  itens: RegistroCrud[];
  salvar: (prev: EstadoCrud, fd: FormData) => Promise<EstadoCrud>;
  alternarAtiva: (fd: FormData) => Promise<void>;
  voltarHref?: string;
}) {
  const [editando, setEditando] = useState<RegistroCrud | null>(null);
  const [estado, action, pending] = useActionState(salvar, {} as EstadoCrud);

  return (
    <Container largura="estreita" className="space-y-6 p-4">
      <PageHeader
        titulo={titulo}
        acoes={
          <Link href={voltarHref}>
            <Botao variante="secundario">Voltar</Botao>
          </Link>
        }
      />

      <div className="space-y-3 rounded-2xl border border-linha bg-white p-5">
        <h2 className="font-display text-sm font-semibold text-texto">{editando ? "Editar" : "Novo"}</h2>
        <form action={action} className="space-y-3">
          {editando && <input type="hidden" name="id" value={editando.id} />}
          {campos.map((c) => (
            <Campo key={c.nome} label={c.label}>
              {c.tipo === "select" ? (
                <select
                  name={c.nome}
                  required={c.obrigatorio}
                  defaultValue={String(editando?.[c.nome] ?? "")}
                  className={inputCls}
                >
                  <option value="">—</option>
                  {c.opcoes?.map((o) => (
                    <option key={o.valor} value={o.valor}>
                      {o.label}
                    </option>
                  ))}
                </select>
              ) : c.tipo === "textarea" ? (
                <textarea
                  name={c.nome}
                  required={c.obrigatorio}
                  defaultValue={String(editando?.[c.nome] ?? "")}
                  className={inputCls}
                />
              ) : (
                <input
                  name={c.nome}
                  type={c.tipo === "numero" ? "number" : "text"}
                  step={c.tipo === "numero" ? "0.01" : undefined}
                  required={c.obrigatorio}
                  defaultValue={String(editando?.[c.nome] ?? "")}
                  className={inputCls}
                />
              )}
            </Campo>
          ))}
          {estado.erro && <p className="text-sm text-negativo">{estado.erro}</p>}
          {estado.ok && <p className="text-sm text-verde">Salvo.</p>}
          <div className="flex gap-2">
            <Botao type="submit" disabled={pending} variante="primario">
              {pending ? "Salvando…" : "Salvar"}
            </Botao>
            {editando && (
              <Botao type="button" variante="secundario" onClick={() => setEditando(null)}>
                Cancelar
              </Botao>
            )}
          </div>
        </form>
      </div>

      <Painel>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-linha bg-creme/60 text-left">
              {campos.map((c) => (
                <th
                  key={c.nome}
                  className="px-4 py-3 font-mono text-[10.5px] font-medium uppercase tracking-wide text-cinza-claro"
                >
                  {c.label}
                </th>
              ))}
              <th className="px-4 py-3 font-mono text-[10.5px] font-medium uppercase tracking-wide text-cinza-claro">
                Status
              </th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {itens.map((it) => (
              <tr key={it.id} className={`border-b border-linha/70 last:border-0 ${it.ativa ? "" : "opacity-60"}`}>
                {campos.map((c) => (
                  <td key={c.nome} className="px-4 py-3 text-texto">
                    {String(it[c.nome] ?? "")}
                  </td>
                ))}
                <td className="px-4 py-3">
                  <Badge variante={it.ativa ? "positivo" : "neutro"}>{it.ativa ? "Ativo" : "Inativo"}</Badge>
                </td>
                <td className="px-4 py-3 text-right">
                  <button type="button" onClick={() => setEditando(it)} className="mr-3 text-cinza hover:text-verde">
                    Editar
                  </button>
                  <form action={alternarAtiva} className="inline">
                    <input type="hidden" name="id" value={it.id} />
                    <input type="hidden" name="ativa" value={it.ativa ? "false" : "true"} />
                    <button type="submit" className="text-cinza hover:text-verde">
                      {it.ativa ? "Inativar" : "Reativar"}
                    </button>
                  </form>
                </td>
              </tr>
            ))}
            {itens.length === 0 && (
              <tr>
                <td colSpan={campos.length + 2} className="px-4 py-8 text-center text-cinza-claro">
                  Nenhum registro.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Painel>
    </Container>
  );
}
