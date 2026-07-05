import { iniciais } from "@/lib/ui/apresentacao";
export function Iniciais({ nome, className }: { nome: string; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`grid h-9 w-9 flex-none place-items-center rounded-lg bg-verde/10 text-sm font-semibold text-verde ${className ?? ""}`}
    >
      {iniciais(nome)}
    </span>
  );
}
