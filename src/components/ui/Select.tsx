import type { SelectHTMLAttributes } from "react";
export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={`w-full rounded-lg border border-linha bg-white px-3 py-2 text-sm text-texto focus:border-verde ${className ?? ""}`}
    />
  );
}
