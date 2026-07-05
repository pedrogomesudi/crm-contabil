import type { InputHTMLAttributes } from "react";
export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full rounded-lg border border-linha bg-white px-3 py-2 text-sm text-texto placeholder:text-cinza-claro focus:border-verde ${className ?? ""}`}
    />
  );
}
