import Link from "next/link";
import type { Passo } from "@/lib/comercial/contratoProposta";

const ACAO: Record<Passo["chave"], string> = {
  converter: "Converter",
  gerar: "Gerar",
  assinar: "Enviar",
};

function Indicador({ situacao }: { situacao: Passo["situacao"] }) {
  if (situacao === "feito") {
    return (
      <span className="grid h-6 w-6 flex-none place-items-center rounded-full bg-verde/10 text-xs font-semibold text-verde">
        ✓
      </span>
    );
  }
  const cor = situacao === "atual" ? "bg-verde" : "bg-linha";
  return <span className={`mt-0.5 h-3 w-3 flex-none rounded-full ${cor}`} aria-hidden="true" />;
}

export function ContratoHonorarios({
  passos,
  propostaAceita,
  concluido,
}: {
  passos: Passo[];
  propostaAceita: boolean;
  concluido: boolean;
}) {
  const linkCliente = passos.find((p) => p.chave === "assinar")?.href ?? null;
  return (
    <div className="space-y-3 rounded-2xl border border-linha bg-white p-4">
      <h3 className="font-display text-sm font-semibold text-texto">Contrato de honorários</h3>

      {concluido ? (
        <div className="rounded-lg bg-verde/10 p-3 text-sm text-verde">
          Contrato de honorários assinado.
          {linkCliente && (
            <Link href={linkCliente} className="ml-2 underline">
              ver no cliente
            </Link>
          )}
        </div>
      ) : (
        <>
          {!propostaAceita && (
            <p className="text-xs text-cinza">Marque a proposta como aceita para seguir com o contrato.</p>
          )}
          <ol className="space-y-2">
            {passos.map((p) => (
              <li key={p.chave} className="flex items-start gap-2 text-sm">
                <Indicador situacao={p.situacao} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={p.situacao === "pendente" ? "text-cinza-claro" : "text-texto"}>{p.rotulo}</span>
                    {p.situacao === "atual" && p.href && (
                      <Link href={p.href} className="text-xs text-verde underline">
                        {ACAO[p.chave]}
                      </Link>
                    )}
                    {p.situacao === "feito" && p.href && (
                      <Link href={p.href} className="text-xs text-cinza underline">
                        ver
                      </Link>
                    )}
                  </div>
                  {p.chave === "assinar" && p.detalhe && <p className="text-[11px] text-cinza">{p.detalhe}</p>}
                </div>
              </li>
            ))}
          </ol>
        </>
      )}
    </div>
  );
}
