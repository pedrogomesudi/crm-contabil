import Link from "next/link";

// Alterna SEÇÕES da mesma rota, com o estado na URL (?aba=fiscal) — link direto e botão
// voltar continuam funcionando. Não confundir com SubNav, que navega ENTRE rotas; o
// visual é o mesmo de propósito, a diferença é o que acontece ao clicar.
//
// `base` é um caminho SEM query string. A troca de aba não preserva outros parâmetros
// da URL — é o comportamento pretendido: abas são navegação (destino fixo), não filtro
// (que precisaria acumular estado). Se `base` já vier com "?", a concatenação abaixo
// produziria uma URL malformada ("?a=1?aba=x"), então isso é responsabilidade do chamador.
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
  // Um bookmark/link antigo pode trazer uma chave que não existe mais em `itens`
  // (?aba=xyz). Sem fallback, nenhuma aba fica marcada e nenhuma recebe aria-current —
  // por isso a primeira aba assume o papel de ativa nesse caso.
  const ativaValida = itens.some((it) => it.chave === ativa) ? ativa : itens[0]?.chave;
  return (
    <nav aria-label="Seções" className="flex flex-wrap gap-1 border-b border-linha">
      {itens.map((it) => {
        const eh = it.chave === ativaValida;
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
