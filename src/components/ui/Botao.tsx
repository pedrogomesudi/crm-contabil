import type { ButtonHTMLAttributes } from "react";

type Variante = "primario" | "secundario" | "fantasma" | "perigo";

const ESTILO: Record<Variante, string> = {
  primario: "bg-verde text-white hover:brightness-95",
  secundario: "border border-linha bg-white text-texto hover:bg-creme",
  fantasma: "text-texto hover:bg-creme",
  perigo: "bg-negativo text-white hover:brightness-95",
};

export function Botao({
  variante = "primario",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variante?: Variante }) {
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center gap-1 rounded-lg px-4 py-2 text-sm font-medium transition disabled:opacity-60 ${ESTILO[variante]} ${className ?? ""}`}
    />
  );
}
