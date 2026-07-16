import Link from "next/link";

// Alterna SEÇÕES da mesma rota, com o estado na URL (?aba=fiscal) — link direto e botão
// voltar continuam funcionando. Não confundir com SubNav, que navega ENTRE rotas; o
// visual é o mesmo de propósito, a diferença é o que acontece ao clicar.
export type ItemAba = { chave: string; rotulo: string; badge?: number };

export function Abas({
  itens,
  ativa,
  base,
  param = "aba",
}: {
  itens: ItemAba[];
  ativa: string;
  base: string;
  param?: string;
}) {
  return (
    <nav aria-label="Seções" className="flex flex-wrap gap-1 border-b border-linha">
      {itens.map((it) => {
        const eh = it.chave === ativa;
        return (
          <Link
            key={it.chave}
            href={`${base}?${param}=${it.chave}`}
            aria-current={eh ? "page" : undefined}
            className={`-mb-px flex items-center gap-1.5 rounded-t-lg border-b-2 px-3 py-2 text-sm transition-colors ${
              eh
                ? "border-verde font-medium text-texto"
                : "border-transparent text-cinza hover:bg-creme hover:text-texto"
            }`}
          >
            {it.rotulo}
            {it.badge ? (
              <span className="rounded-full bg-negativo px-1.5 text-[10px] font-semibold text-white">{it.badge}</span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
