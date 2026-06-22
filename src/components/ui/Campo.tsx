export const inputCls = "w-full rounded border border-slate-300 px-3 py-2 text-slate-900";

// Campo de formulário com label visível associado.
export function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-slate-700">{label}</span>
      {children}
    </label>
  );
}
