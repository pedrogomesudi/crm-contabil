import type { ButtonHTMLAttributes } from "react";
export function Chip({ ativo, className, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { ativo?: boolean }) {
  return (
    <button
      type="button"
      {...props}
      className={`rounded-full border px-3.5 py-1.5 text-sm transition ${
        ativo ? "border-tinta bg-tinta text-creme" : "border-linha bg-white text-cinza hover:border-cinza-claro"
      } ${className ?? ""}`}
    />
  );
}
