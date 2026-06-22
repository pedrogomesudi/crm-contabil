export function CardResumo({ titulo, valor }: { titulo: string; valor: number | string }) {
  return (
    <dl className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <dt className="text-sm text-slate-500">{titulo}</dt>
      <dd className="mt-1 text-2xl font-semibold text-slate-900">{valor}</dd>
    </dl>
  );
}
