import Link from "next/link";
import { totalPaginas } from "@/lib/ui/paginacao";

// Rodapé de navegação de listas renderizadas no servidor. Os links carregam os filtros
// atuais, então paginar não descarta a busca — e a URL continua compartilhável.
export function Paginacao({
  pagina,
  total,
  porPagina,
  base,
  params = {},
}: {
  pagina: number;
  total: number;
  porPagina: number;
  base: string;
  params?: Record<string, string | undefined>;
}) {
  const paginas = totalPaginas(total, porPagina);
  if (paginas <= 1) return null;

  const href = (p: number) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) sp.set(k, v);
    if (p > 1) sp.set("pagina", String(p));
    const qs = sp.toString();
    return qs ? `${base}?${qs}` : base;
  };

  const primeiro = (pagina - 1) * porPagina + 1;
  const ultimo = Math.min(pagina * porPagina, total);
  const cls = "rounded-lg border border-linha px-3 py-1.5 text-sm";

  return (
    <nav
      aria-label="Paginação da lista"
      className="flex flex-wrap items-center justify-between gap-3 border-t border-linha bg-creme/60 px-4 py-3"
    >
      <p className="text-xs text-cinza-claro">
        {primeiro}–{ultimo} de {total} · página {pagina} de {paginas}
      </p>
      <div className="flex items-center gap-2">
        {pagina > 1 ? (
          <Link href={href(pagina - 1)} rel="prev" className={`${cls} text-cinza hover:border-cinza-claro`}>
            Anterior
          </Link>
        ) : (
          <span className={`${cls} text-cinza-claro opacity-50`} aria-disabled="true">
            Anterior
          </span>
        )}
        {pagina < paginas ? (
          <Link href={href(pagina + 1)} rel="next" className={`${cls} text-cinza hover:border-cinza-claro`}>
            Próxima
          </Link>
        ) : (
          <span className={`${cls} text-cinza-claro opacity-50`} aria-disabled="true">
            Próxima
          </span>
        )}
      </div>
    </nav>
  );
}
