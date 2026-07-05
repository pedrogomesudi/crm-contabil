// Classe padrão dos controles de formulário (SALDO). Reusada por telas que passam className.
export const inputCls =
  "w-full rounded-lg border border-linha bg-white px-3 py-2 text-sm text-texto placeholder:text-cinza-claro focus:border-verde";

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
