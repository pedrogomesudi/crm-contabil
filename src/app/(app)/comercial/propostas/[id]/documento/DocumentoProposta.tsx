import Image from "next/image";
import { totaisProposta } from "@/lib/comercial/proposta";
import type { PropostaView } from "../../../propostas-actions";

type Marca = { nome: string | null; cnpj: string | null; enderecoLinha: string };

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dataBR = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

export function DocumentoProposta({ proposta, hoje, marca, logoUrl }: { proposta: PropostaView; hoje: string; marca: Marca; logoUrl: string | null }) {
  const t = totaisProposta(proposta.itens);
  const pg = proposta.pagamento;
  const nomeEscritorio = marca.nome ?? pg.titular;
  return (
    <div className="mx-auto max-w-2xl bg-white p-8 text-texto">
      <header className="border-b border-linha pb-3">
        {logoUrl && <Image src={logoUrl} alt="Logo do escritório" width={140} height={56} className="mb-2 max-h-14 w-auto object-contain" unoptimized />}
        {nomeEscritorio && <p className="font-display text-lg font-semibold">{nomeEscritorio}</p>}
        {(marca.cnpj || marca.enderecoLinha) && (
          <p className="text-xs text-cinza">{[marca.cnpj && `CNPJ ${marca.cnpj}`, marca.enderecoLinha].filter(Boolean).join(" · ")}</p>
        )}
        <h1 className="mt-1 font-display text-xl font-bold">Proposta de Honorários</h1>
        <p className="mt-1 text-sm text-cinza">Nº {proposta.numero} · Emissão {dataBR(hoje)}{proposta.validade ? ` · Válida até ${dataBR(proposta.validade)}` : ""}</p>
      </header>

      <section className="mt-4 text-sm">
        <p><span className="text-cinza">Para:</span> <span className="font-medium">{proposta.prospectNome}</span>{proposta.contatoNome ? ` — a/c ${proposta.contatoNome}` : ""}</p>
      </section>

      <table className="mt-4 w-full text-sm">
        <thead>
          <tr className="border-b border-linha text-left text-xs text-cinza">
            <th className="py-1 font-medium">Descrição</th>
            <th className="py-1 font-medium">Recorrência</th>
            <th className="py-1 text-right font-medium">Valor</th>
          </tr>
        </thead>
        <tbody>
          {proposta.itens.map((i) => (
            <tr key={i.id} className="border-b border-linha/60">
              <td className="py-1.5">{i.descricao}</td>
              <td className="py-1.5">{i.recorrencia === "mensal" ? "Mensal" : "Único"}</td>
              <td className="py-1.5 text-right tabular-nums">{brl(i.valor)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-3 space-y-0.5 text-right text-sm">
        <p>Total mensal: <span className="font-medium tabular-nums">{brl(t.mensal)}</span></p>
        <p>Total único: <span className="font-medium tabular-nums">{brl(t.unico)}</span></p>
      </div>

      {proposta.observacoes && (
        <section className="mt-4 text-sm">
          <h2 className="font-display text-sm font-semibold">Condições</h2>
          <p className="mt-1 whitespace-pre-wrap text-cinza">{proposta.observacoes}</p>
        </section>
      )}

      <section className="mt-4 rounded-lg bg-creme p-3 text-sm">
        <h2 className="font-display text-sm font-semibold">Dados para pagamento</h2>
        <div className="mt-1 space-y-0.5 text-cinza">
          {pg.pixChave && <p>PIX: {pg.pixChave}</p>}
          {(pg.banco || pg.agencia || pg.conta) && <p>{[pg.banco, pg.agencia && `Ag. ${pg.agencia}`, pg.conta && `Conta ${pg.conta}`].filter(Boolean).join(" · ")}</p>}
          {(pg.titular || pg.documento) && <p>{[pg.titular, pg.documento].filter(Boolean).join(" · ")}</p>}
        </div>
      </section>
    </div>
  );
}
