import type { LinhaComparativo } from "@/lib/financeiro/orcado-realizado";

export function BarrasCategoria({ linhas }: { linhas: LinhaComparativo[] }) {
  const max = Math.max(1, ...linhas.flatMap((l) => [l.orcado, l.realizado]));
  if (linhas.length === 0) return <p className="text-xs text-cinza-claro">Sem categorias.</p>;
  return (
    <div className="space-y-2.5">
      {linhas.map((l) => {
        const ruim = l.natureza === "DESPESA" ? l.realizado > l.orcado : l.realizado < l.orcado;
        return (
          <div key={l.categoriaId} className="grid grid-cols-[110px_1fr] items-center gap-2">
            <span className="truncate text-xs text-texto">{l.nome}</span>
            <div className="relative h-5">
              <div className="absolute left-0 top-0 h-2 rounded bg-[#d8d4ca]" style={{ width: `${(l.orcado / max) * 100}%` }} />
              <div className={`absolute left-0 top-2.5 h-2 rounded ${ruim ? "bg-negativo" : "bg-verde"}`} style={{ width: `${(l.realizado / max) * 100}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
