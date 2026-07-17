// A aparência do controle de formulário (SALDO) — input, select e textarea.
// NÃO carrega largura: isso é do contexto (o FormGrid, ou um w-full declarado). O `inputCls`
// antigo carregava `w-full`, e era por isso que 47 dos 80 controles do sistema não podiam usá-lo.
const BASE =
  "rounded-lg border border-linha bg-white text-sm text-texto placeholder:text-cinza-claro focus:border-verde";

// Único eixo que varia. O compacto não é divergência: é o tamanho que 14 controles usam em
// contexto denso (kanban, linha de tabela, grade). Fingir que só existe um degrau foi o que
// produziu as 5 famílias de classe copiada.
const PADDING = {
  padrao: "px-3 py-2",
  compacto: "px-2 py-1.5",
} as const;

export function controleCls(tamanho: keyof typeof PADDING = "padrao"): string {
  return `${BASE} ${PADDING[tamanho]}`;
}

// Campo de formulário com label visível associado (o controle vai aninhado no <label>).
export function Campo({
  label,
  hint,
  erro,
  children,
}: {
  label: string;
  hint?: string;
  erro?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5 text-sm">
      <span className="block text-xs font-medium text-cinza">{label}</span>
      {children}
      {erro ? (
        <span className="block text-xs text-negativo">{erro}</span>
      ) : hint ? (
        <span className="block text-xs text-cinza-claro">{hint}</span>
      ) : null}
    </label>
  );
}
