import Link from "next/link";

// Aviso de acesso suspenso por pendência financeira. `banner` = faixa no topo
// (todas as telas); `bloqueio` = ocupa a seção travada (documentos/notas/guias).
export function AvisoSuspensao({ variante, recurso }: { variante: "banner" | "bloqueio"; recurso?: string }) {
  if (variante === "banner") {
    return (
      <div className="rounded-lg border border-negativo/40 bg-negativo/5 px-4 py-3 text-sm text-negativo" role="alert">
        Acesso parcialmente suspenso por pendência financeira. Regularize os{" "}
        <Link href="/portal/boletos" className="font-medium underline">
          boletos
        </Link>{" "}
        para reativar.
      </div>
    );
  }
  return (
    <div className="rounded-2xl border border-linha bg-white p-8 text-center" role="alert">
      <h1 className="text-base font-semibold text-texto">{recurso ?? "Este recurso"} indisponível</h1>
      <p className="mt-2 text-sm text-cinza">
        O acesso está suspenso por pendência financeira. Assim que os boletos em aberto forem pagos, ele volta
        automaticamente.
      </p>
      <Link
        href="/portal/boletos"
        className="mt-4 inline-block rounded-lg bg-verde px-4 py-2 text-sm font-medium text-white"
      >
        Ver boletos
      </Link>
    </div>
  );
}
