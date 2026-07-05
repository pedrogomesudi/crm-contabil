import type { InputHTMLAttributes } from "react";
export function Toolbar({
  busca,
  children,
}: {
  busca?: InputHTMLAttributes<HTMLInputElement>;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {busca && (
        <div className="relative min-w-[220px] flex-1">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 text-cinza-claro"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.2-3.2" />
          </svg>
          <input
            {...busca}
            className="w-full rounded-xl border border-linha bg-white py-2.5 pl-9 pr-3 text-sm text-texto placeholder:text-cinza-claro focus:border-verde"
          />
        </div>
      )}
      {children}
    </div>
  );
}
