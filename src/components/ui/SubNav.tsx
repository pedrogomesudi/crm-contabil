import Link from "next/link";

export type ItemSubNav = { href: string; label: string; badge?: number };

// Navegação secundária de uma seção: o que saiu do menu lateral vive aqui, dentro do pai.
export function SubNav({ itens }: { itens: ItemSubNav[] }) {
  if (itens.length === 0) return null;
  return (
    <nav aria-label="Seções relacionadas" className="flex flex-wrap gap-1.5 text-sm">
      {itens.map((it) => (
        <Link
          key={it.href}
          href={it.href}
          className="flex items-center gap-1.5 rounded-lg border border-linha bg-white px-3 py-1.5 text-cinza hover:bg-creme"
        >
          {it.label}
          {it.badge ? (
            <span className="rounded-full bg-negativo px-1.5 text-[10px] font-semibold text-white">{it.badge}</span>
          ) : null}
        </Link>
      ))}
    </nav>
  );
}
