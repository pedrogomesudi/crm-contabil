// Bloco titulado. Substitui os ~50 "rounded-2xl border border-linha bg-white" escritos à
// mão, que hoje têm 6 paddings e 2 raios diferentes para o mesmo conceito.
export function Secao({
  titulo,
  descricao,
  acoes,
  // `nivel` existe porque a Secao é usada em pontos diferentes da árvore de headings:
  // onde ela substitui um card que já vivia sob um <h2>, forçar sempre <h2> criaria um
  // <h2> duplicado (ou pularia de <h1> para <h3>), quebrando WCAG 1.3.1. É semântica de
  // documento, não estilo — por isso é prop e não classe.
  nivel = 2,
  // `padding=false` existe para o card full-bleed (tabela colada na borda, sem header):
  // é o padrão dominante do sistema (~12 telas). Isso é prop, não className, porque o
  // projeto não usa tailwind-merge — sem ele, duas classes de padding concorrentes são
  // resolvidas pela ORDEM DE EMISSÃO do CSS gerado, não pela ordem da string, então
  // sobrescrever "p-5" via className seria frágil e dependente de build.
  padding = true,
  className = "",
  children,
}: {
  titulo?: string;
  descricao?: string;
  acoes?: React.ReactNode;
  nivel?: 2 | 3;
  padding?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const Titulo = nivel === 3 ? "h3" : "h2";
  return (
    // overflow-hidden é obrigatório aqui: sem ele, uma tabela full-bleed (padding={false})
    // vaza sobre os cantos arredondados do card em vez de ser recortada por eles.
    <section className={`overflow-hidden rounded-2xl border border-linha bg-white shadow-card ${className}`}>
      {titulo && (
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-linha px-5 py-4">
          <div>
            <Titulo className="font-display text-lg font-semibold tracking-tight text-texto">{titulo}</Titulo>
            {descricao && <p className="mt-0.5 text-xs text-cinza">{descricao}</p>}
          </div>
          {acoes && <div className="flex items-center gap-2">{acoes}</div>}
        </header>
      )}
      <div className={padding ? "p-5" : undefined}>{children}</div>
    </section>
  );
}
