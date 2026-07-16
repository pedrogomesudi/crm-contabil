// Bloco titulado. Substitui os ~50 "rounded-2xl border border-linha bg-white" escritos à
// mão, que hoje têm 6 paddings e 2 raios diferentes para o mesmo conceito.
export function Secao({
  titulo,
  descricao,
  acoes,
  className = "",
  children,
}: {
  titulo: string;
  descricao?: string;
  acoes?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={`rounded-2xl border border-linha bg-white shadow-card ${className}`}>
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-linha px-5 py-4">
        <div>
          <h2 className="font-display text-lg font-semibold tracking-tight text-texto">{titulo}</h2>
          {descricao && <p className="mt-0.5 text-xs text-cinza">{descricao}</p>}
        </div>
        {acoes && <div className="flex items-center gap-2">{acoes}</div>}
      </header>
      <div className="p-5">{children}</div>
    </section>
  );
}
